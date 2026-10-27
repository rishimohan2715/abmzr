"""FastAPI application: UK Wind Forecast Accuracy API.

Exposes two endpoints consumed by the trading-desk dashboard:

* GET /api/generation  -> aligned Actual vs. Day-ahead Forecast timeline
* GET /api/metrics     -> aggregated MAE / RMSE / Bias + hourly & daily error

Scope (per challenge brief): national wind generation, January 2026, Elexon only.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from elexon_service import ElexonServiceError, service
from schemas import (
    GenerationResponse,
    HealthResponse,
    HorizonResponse,
    MetricsResponse,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("api")

# The brief scopes us to "purchase decisions to be made in January 2026".
# A decision taken on day D is for delivery on D+1, so decisions on 1-31 Jan
# 2026 correspond to DELIVERY days 2 Jan - 1 Feb 2026. The API's startDate /
# endDate are delivery dates; these defaults encode that mapping.
DEFAULT_START = "2026-01-02"  # delivery for the 1 Jan decision
DEFAULT_END = "2026-02-01"    # delivery for the 31 Jan decision

app = FastAPI(
    title="UK Wind Forecast Accuracy API",
    description=(
        "Quantitative accuracy of Elexon day-ahead wind forecasts vs. actual "
        "generation, built for a UK day-ahead power-trading desk."
    ),
    version="1.0.0",
)

# CORS: the React dev server and the deployed frontend call this API directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _validate_window(start_date: str, end_date: str) -> None:
    """Reject malformed or inverted date ranges with a clear 400."""
    try:
        s = date.fromisoformat(start_date)
        e = date.fromisoformat(end_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Dates must be YYYY-MM-DD: {exc}") from exc
    if s > e:
        raise HTTPException(status_code=400, detail="startDate must be on or before endDate")


@app.get("/", tags=["meta"])
async def root() -> dict:
    return {
        "service": "UK Wind Forecast Accuracy API",
        "docs": "/docs",
        "endpoints": ["/api/generation", "/api/metrics", "/api/health"],
    }


@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        data_source="Elexon BMRS Insights (FUELHH + WINDFOR)",
        cached_records=service.cached_record_count(),
    )


@app.get("/api/generation", response_model=GenerationResponse, tags=["data"])
async def get_generation(
    startDate: str = Query(DEFAULT_START, description="Window start, YYYY-MM-DD"),
    endDate: str = Query(DEFAULT_END, description="Window end (inclusive), YYYY-MM-DD"),
) -> GenerationResponse:
    """Aligned Actual vs. Day-ahead Forecast wind generation on the 30-min grid."""
    _validate_window(startDate, endDate)
    try:
        series = await service.get_aligned(startDate, endDate)
    except ElexonServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Decision window = delivery window shifted back one day (decisions for
    # delivery day D are made on D-1).
    one_day = timedelta(days=1)
    decision_start = (date.fromisoformat(startDate) - one_day).isoformat()
    decision_end = (date.fromisoformat(endDate) - one_day).isoformat()

    pubs = [p["forecast_publish_time"] for p in series if p.get("forecast_publish_time")]
    leads = [p["forecast_lead_hours"] for p in series if p.get("forecast_lead_hours") is not None]

    return GenerationResponse(
        start_date=startDate,
        end_date=endDate,
        decision_start=decision_start,
        decision_end=decision_end,
        count=len(series),
        latest_forecast_publish=max(pubs) if pubs else None,
        mean_lead_hours=round(sum(leads) / len(leads), 1) if leads else None,
        series=series,
    )


@app.get("/api/metrics", response_model=MetricsResponse, tags=["data"])
async def get_metrics(
    startDate: str = Query(DEFAULT_START, description="Window start, YYYY-MM-DD"),
    endDate: str = Query(DEFAULT_END, description="Window end (inclusive), YYYY-MM-DD"),
) -> MetricsResponse:
    """Aggregated forecast-accuracy metrics + hourly/daily error distributions."""
    _validate_window(startDate, endDate)
    try:
        metrics = await service.get_metrics(startDate, endDate)
    except ElexonServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return MetricsResponse(**metrics)


@app.get("/api/horizon", response_model=HorizonResponse, tags=["data"])
async def get_horizon(
    startDate: str = Query(DEFAULT_START, description="Window start, YYYY-MM-DD"),
    endDate: str = Query(DEFAULT_END, description="Window end (inclusive), YYYY-MM-DD"),
) -> HorizonResponse:
    """Forecast skill (MAE/bias) as a function of lead time, across all revisions."""
    _validate_window(startDate, endDate)
    try:
        horizon = await service.get_horizon(startDate, endDate)
    except ElexonServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return HorizonResponse(**horizon)
