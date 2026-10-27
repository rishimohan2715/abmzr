"""Pydantic schemas for the Wind Forecast Accuracy API.

These models define the shape of the data returned by the API so that the
frontend (and any other consumer) has a stable, typed contract to rely on.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class GenerationPoint(BaseModel):
    """A single 30-minute settlement period on the aligned timeline."""

    start_time: datetime = Field(..., description="Target delivery time (UTC), 30-min resolution")
    actual: Optional[float] = Field(None, description="Actual wind generation (MW)")
    forecast: Optional[float] = Field(None, description="Day-ahead forecast wind generation (MW)")
    error: Optional[float] = Field(
        None, description="Forecast error = forecast - actual (MW). Positive => over-forecast"
    )
    abs_error: Optional[float] = Field(None, description="Absolute forecast error |forecast - actual| (MW)")

    # Forecast provenance — which forecast the desk actually had, and when.
    forecast_publish_time: Optional[datetime] = Field(
        None, description="publishTime of the WINDFOR revision used for this period"
    )
    forecast_lead_hours: Optional[float] = Field(
        None, description="Hours between the forecast's publishTime and delivery"
    )
    decision_date: Optional[str] = Field(
        None, description="Day-ahead decision date for this delivery period (delivery day - 1)"
    )
    gate_closure: Optional[datetime] = Field(
        None, description="Day-ahead gate closure that bounded the forecast choice"
    )


class GenerationResponse(BaseModel):
    """Aligned Actuals vs. Forecast timeline for a requested window."""

    start_date: str = Field(..., description="Delivery window start (YYYY-MM-DD)")
    end_date: str = Field(..., description="Delivery window end (YYYY-MM-DD)")
    decision_start: str = Field(..., description="Corresponding decision window start (delivery - 1 day)")
    decision_end: str = Field(..., description="Corresponding decision window end (delivery - 1 day)")
    count: int = Field(..., description="Number of aligned points returned")
    latest_forecast_publish: Optional[datetime] = Field(
        None, description="Most recent WINDFOR publishTime used anywhere in this window"
    )
    mean_lead_hours: Optional[float] = Field(
        None, description="Average lead time of the forecasts used (hours)"
    )
    series: List[GenerationPoint]


class HourlyError(BaseModel):
    """Mean error metrics bucketed by hour-of-day (0-23)."""

    hour: int = Field(..., ge=0, le=23)
    mae: float = Field(..., description="Mean Absolute Error for this hour (MW)")
    bias: float = Field(..., description="Mean signed error (forecast - actual) for this hour (MW)")
    count: int


class DailyError(BaseModel):
    """Mean error metrics bucketed by calendar day."""

    date: str
    mae: float
    rmse: float
    bias: float
    count: int


class ErrorBin(BaseModel):
    """One bucket of the signed-error histogram."""

    bin_start: float
    bin_end: float
    center: float
    count: int


class Distribution(BaseModel):
    """Signed-error distribution and key percentiles (MW)."""

    bins: List[ErrorBin] = Field(default_factory=list)
    p10: float = Field(..., description="10th percentile of signed error (MW)")
    p50: float = Field(..., description="Median signed error (MW)")
    p90: float = Field(..., description="90th percentile of signed error (MW)")
    p90_abs: float = Field(..., description="90th percentile of |error| — risk buffer (MW)")


class Procurement(BaseModel):
    """Business translation of forecast error into procurement exposure.

    Sign convention: error = forecast - actual.
      * error > 0  => wind under-delivered vs forecast => desk is SHORT
                      (must procure extra power).
      * error < 0  => wind over-delivered             => desk is LONG (surplus).
    Energy = power (MW) x 0.5 h per settlement period.
    """

    shortfall_energy_mwh: float = Field(..., description="Energy the desk was short over the window (MWh)")
    surplus_energy_mwh: float = Field(..., description="Energy the desk was long over the window (MWh)")
    total_gap_energy_mwh: float = Field(..., description="Total absolute mismatched energy (MWh)")
    p90_buffer_mw: float = Field(..., description="P90 |error| — a prudent procurement buffer (MW)")


class MetricsResponse(BaseModel):
    """Aggregated statistical accuracy metrics for the requested window."""

    start_date: str
    end_date: str
    sample_count: int = Field(..., description="Number of matched (actual & forecast) periods")

    mae: float = Field(..., description="Mean Absolute Error (MW)")
    rmse: float = Field(..., description="Root Mean Square Error (MW)")
    bias: float = Field(..., description="Mean signed error, forecast - actual (MW)")
    bias_pct: float = Field(
        ..., description="Bias as a percentage of mean actual generation (%). + => over-forecast"
    )
    mape: float = Field(..., description="Mean Absolute Percentage Error (%)")
    mean_actual: float = Field(..., description="Mean actual generation over the window (MW)")
    normalised_mae_pct: float = Field(
        ..., description="MAE as a percentage of mean actual generation (%)"
    )

    peak_error: float = Field(..., description="Largest absolute error observed (MW)")
    peak_error_time: Optional[datetime] = Field(None, description="Time of the largest absolute error")
    worst_day: Optional[str] = Field(None, description="Calendar day with the highest daily MAE")

    distribution: Distribution
    procurement: Procurement

    hourly: List[HourlyError] = Field(default_factory=list)
    daily: List[DailyError] = Field(default_factory=list)


class HorizonBucket(BaseModel):
    """Forecast accuracy for a given lead-time (how far ahead it was published)."""

    label: str = Field(..., description="Lead-time bucket, e.g. '12-18h'")
    min_hours: float
    max_hours: float
    mae: float
    bias: float
    count: int


class HorizonResponse(BaseModel):
    """Forecast skill as a function of lead time (uses all WINDFOR revisions)."""

    start_date: str
    end_date: str
    buckets: List[HorizonBucket] = Field(default_factory=list)
    day_ahead_mae: Optional[float] = Field(
        None, description="MAE for the ~24h day-ahead horizon bucket (MW)"
    )


class HealthResponse(BaseModel):
    status: str
    data_source: str
    cached_records: int
