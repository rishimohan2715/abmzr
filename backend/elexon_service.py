"""Service layer: fetch, align and analyse Elexon wind data.

Responsibilities
----------------
* Fetch actual wind generation (FUELHH, fuelType == "WIND") and day-ahead
  wind forecasts (WINDFOR) from the Elexon BMRS Insights API.
* Pick the appropriate *day-ahead* forecast for every delivery period
  (multiple forecasts are published per target time; we keep the latest one
  that a trader would actually have had before day-ahead gate closure).
* Align actuals and forecasts on the 30-minute ``startTime`` grid.
* Compute quantitative error metrics (MAE, RMSE, bias, MAPE) plus hourly and
  daily error distributions.

Data is fetched once per window and cached in-memory with a short TTL, so the
API stays responsive and we stay well within Elexon's fair-use limits.
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger("elexon_service")

# Elexon BMRS Insights API (the live data host; the PDF links to the docs host).
BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
FUELHH_STREAM = f"{BASE_URL}/datasets/FUELHH/stream"
WINDFOR_STREAM = f"{BASE_URL}/datasets/WINDFOR/stream"

REQUEST_TIMEOUT = 60.0
CACHE_TTL_SECONDS = 15 * 60  # 15 minutes

# Day-ahead gate closure heuristic: a decision for delivery day D is made on
# D-1. We treat the forecast available at 11:00 UTC on D-1 as the one the desk
# would have traded on. This drives which WINDFOR revision we align against.
GATE_CLOSURE_HOUR_UTC = 11


class ElexonServiceError(Exception):
    """Raised when upstream data cannot be fetched or parsed."""


def _parse_dt(value: str) -> datetime:
    """Parse an ISO8601 timestamp from Elexon into an aware UTC datetime."""
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class ElexonService:
    """Fetches, caches, aligns and analyses Elexon wind data."""

    def __init__(self) -> None:
        # Cache keyed by (start_date, end_date) -> (timestamp, aligned points).
        self._cache: Dict[Tuple[str, str], Tuple[float, List[dict]]] = {}
        # Raw fetch cache so horizon analysis can reuse actuals + all revisions.
        self._raw_cache: Dict[Tuple[str, str], Tuple[float, dict, dict]] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ fetch
    async def _fetch_stream(
        self, client: httpx.AsyncClient, url: str, params: dict
    ) -> List[dict]:
        """GET an Elexon /stream endpoint and return the raw list of records."""
        logger.info("Fetching %s params=%s", url, params)
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        # Stream endpoints return a bare JSON array; be tolerant of {"data": [...]}.
        if isinstance(data, dict):
            data = data.get("data", [])
        if not isinstance(data, list):
            raise ElexonServiceError(f"Unexpected response shape from {url}")
        return data

    async def _fetch_actuals(
        self, client: httpx.AsyncClient, start: datetime, end: datetime
    ) -> Dict[datetime, float]:
        """Return {startTime: generation} for WIND from FUELHH."""
        params = {
            "publishDateTimeFrom": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        records = await self._fetch_stream(client, FUELHH_STREAM, params)
        actuals: Dict[datetime, float] = {}
        for r in records:
            if (r.get("fuelType") or r.get("fuelTYPE")) != "WIND":
                continue
            st = r.get("startTime")
            gen = r.get("generation")
            if st is None or gen is None:
                continue
            actuals[_parse_dt(st)] = float(gen)
        logger.info("Parsed %d WIND actual periods", len(actuals))
        return actuals

    async def _fetch_forecast_revisions(
        self, client: httpx.AsyncClient, start: datetime, end: datetime
    ) -> Dict[datetime, List[Tuple[datetime, float]]]:
        """Return {startTime: [(publishTime, generation), ...]} — all revisions.

        WINDFOR publishes many revisions per target time; we keep them all so we
        can both select the day-ahead revision and analyse skill-vs-lead-time.
        """
        params = {
            "publishDateTimeFrom": (start - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        records = await self._fetch_stream(client, WINDFOR_STREAM, params)
        revisions: Dict[datetime, List[Tuple[datetime, float]]] = defaultdict(list)
        for r in records:
            st = r.get("startTime")
            gen = r.get("generation")
            pub = r.get("publishTime")
            if st is None or gen is None or pub is None:
                continue
            revisions[_parse_dt(st)].append((_parse_dt(pub), float(gen)))
        return revisions

    def _select_day_ahead(
        self, revisions: Dict[datetime, List[Tuple[datetime, float]]]
    ) -> Dict[datetime, Tuple[float, datetime]]:
        """For each target time pick the day-ahead revision (latest before gate).

        We keep the forecast with the latest ``publishTime`` at or before the
        day-ahead gate closure (11:00 UTC on the day before delivery) — the
        information a day-ahead trader actually had — falling back to the latest
        revision published before delivery.

        Returns {startTime: (generation, publishTime)} so the UI can show exactly
        which forecast vintage each point came from.
        """
        forecasts: Dict[datetime, Tuple[float, datetime]] = {}
        for st, revs in revisions.items():
            cutoff = self._gate_closure(st)
            eligible = [rv for rv in revs if rv[0] <= cutoff]
            if not eligible:
                eligible = [rv for rv in revs if rv[0] <= st]
            chosen = max(eligible, key=lambda x: x[0]) if eligible else max(revs, key=lambda x: x[0])
            forecasts[st] = (chosen[1], chosen[0])
        logger.info("Selected day-ahead forecast for %d target periods", len(forecasts))
        return forecasts

    @staticmethod
    def _gate_closure(start_time: datetime) -> datetime:
        """Day-ahead gate closure for a given delivery period."""
        delivery_day = start_time.date()
        day_before = delivery_day - timedelta(days=1)
        return datetime(
            day_before.year, day_before.month, day_before.day,
            GATE_CLOSURE_HOUR_UTC, 0, 0, tzinfo=timezone.utc,
        )

    # ------------------------------------------------------------------ fetch+cache
    async def _get_raw(
        self, start_date: str, end_date: str
    ) -> Tuple[Dict[datetime, float], Dict[datetime, List[Tuple[datetime, float]]]]:
        """Fetch (and cache) actuals and all forecast revisions for the window."""
        key = (start_date, end_date)
        cached = self._raw_cache.get(key)
        if cached and (time.time() - cached[0]) < CACHE_TTL_SECONDS:
            return cached[1], cached[2]

        start = _parse_dt(f"{start_date}T00:00:00Z")
        end = _parse_dt(f"{end_date}T23:59:59Z")
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                actuals, revisions = await asyncio.gather(
                    self._fetch_actuals(client, start, end),
                    self._fetch_forecast_revisions(client, start, end),
                )
        except httpx.HTTPError as exc:
            logger.exception("Upstream fetch failed")
            raise ElexonServiceError(f"Failed to fetch Elexon data: {exc}") from exc

        self._raw_cache[key] = (time.time(), actuals, revisions)
        return actuals, revisions

    # ------------------------------------------------------------------ align
    async def get_aligned(self, start_date: str, end_date: str) -> List[dict]:
        """Return the cached/fetched aligned timeline for the window."""
        key = (start_date, end_date)
        async with self._lock:
            cached = self._cache.get(key)
            if cached and (time.time() - cached[0]) < CACHE_TTL_SECONDS:
                logger.info("Cache hit for %s", key)
                return cached[1]

            start = _parse_dt(f"{start_date}T00:00:00Z")
            end = _parse_dt(f"{end_date}T23:59:59Z")

            actuals, revisions = await self._get_raw(start_date, end_date)
            forecasts = self._select_day_ahead(revisions)

            all_times = sorted(set(actuals) | set(forecasts))
            series: List[dict] = []
            for t in all_times:
                if not (start <= t <= end):
                    continue
                a = actuals.get(t)
                fc = forecasts.get(t)
                f = fc[0] if fc else None
                pub = fc[1] if fc else None
                err = (f - a) if (a is not None and f is not None) else None
                series.append(
                    {
                        "start_time": t,
                        "actual": a,
                        "forecast": f,
                        "error": err,
                        "abs_error": abs(err) if err is not None else None,
                        "forecast_publish_time": pub,
                        "forecast_lead_hours": (
                            round((t - pub).total_seconds() / 3600.0, 1) if pub else None
                        ),
                        "decision_date": (t.date() - timedelta(days=1)).isoformat(),
                        "gate_closure": self._gate_closure(t),
                    }
                )

            self._cache[key] = (time.time(), series)
            logger.info("Aligned %d periods for %s", len(series), key)
            return series

    # ---------------------------------------------------------------- metrics
    async def get_metrics(self, start_date: str, end_date: str) -> dict:
        """Compute aggregate + hourly + daily error metrics for the window."""
        series = await self.get_aligned(start_date, end_date)
        matched = [p for p in series if p["actual"] is not None and p["forecast"] is not None]

        if not matched:
            raise ElexonServiceError(
                "No overlapping actual & forecast data found for the requested window."
            )

        errors = [p["error"] for p in matched]
        abs_errors = [p["abs_error"] for p in matched]
        actuals = [p["actual"] for p in matched]
        n = len(matched)

        mae = sum(abs_errors) / n
        rmse = math.sqrt(sum(e * e for e in errors) / n)
        bias = sum(errors) / n
        mean_actual = sum(actuals) / n

        # MAPE guards against division by (near) zero actual generation.
        pct_terms = [abs(e) / a for e, a in zip(errors, actuals) if a and a > 1.0]
        mape = (sum(pct_terms) / len(pct_terms) * 100.0) if pct_terms else 0.0
        normalised_mae = (mae / mean_actual * 100.0) if mean_actual else 0.0
        # Signed bias as a share of mean actual output — "how much the model
        # over/under-forecasts in percentage terms".
        bias_pct = (bias / mean_actual * 100.0) if mean_actual else 0.0

        peak_point = max(matched, key=lambda p: p["abs_error"])

        hourly = self._hourly_errors(matched)
        daily = self._daily_errors(matched)
        worst_day = max(daily, key=lambda d: d["mae"])["date"] if daily else None

        distribution = self._build_distribution(errors, abs_errors)
        procurement = self._build_procurement(errors, abs_errors)

        return {
            "start_date": start_date,
            "end_date": end_date,
            "sample_count": n,
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "bias": round(bias, 2),
            "bias_pct": round(bias_pct, 2),
            "mape": round(mape, 2),
            "mean_actual": round(mean_actual, 2),
            "normalised_mae_pct": round(normalised_mae, 2),
            "peak_error": round(peak_point["abs_error"], 2),
            "peak_error_time": peak_point["start_time"],
            "worst_day": worst_day,
            "distribution": distribution,
            "procurement": procurement,
            "hourly": hourly,
            "daily": daily,
        }

    # ------------------------------------------------------------ distribution
    @staticmethod
    def _percentile(sorted_vals: List[float], pct: float) -> float:
        """Linear-interpolated percentile of an already-sorted list."""
        if not sorted_vals:
            return 0.0
        if len(sorted_vals) == 1:
            return sorted_vals[0]
        rank = pct / 100.0 * (len(sorted_vals) - 1)
        lo = int(math.floor(rank))
        hi = int(math.ceil(rank))
        if lo == hi:
            return sorted_vals[lo]
        frac = rank - lo
        return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac

    def _build_distribution(self, errors: List[float], abs_errors: List[float]) -> dict:
        """Histogram of signed error (MW) plus P10/P50/P90 percentiles."""
        s_err = sorted(errors)
        lo, hi = s_err[0], s_err[-1]
        n_bins = 21
        span = (hi - lo) or 1.0
        width = span / n_bins
        counts = [0] * n_bins
        for e in errors:
            idx = min(int((e - lo) / width), n_bins - 1)
            counts[idx] += 1
        bins = [
            {
                "bin_start": round(lo + i * width, 1),
                "bin_end": round(lo + (i + 1) * width, 1),
                "center": round(lo + (i + 0.5) * width, 1),
                "count": counts[i],
            }
            for i in range(n_bins)
        ]
        return {
            "bins": bins,
            "p10": round(self._percentile(s_err, 10), 2),
            "p50": round(self._percentile(s_err, 50), 2),
            "p90": round(self._percentile(s_err, 90), 2),
            "p90_abs": round(self._percentile(sorted(abs_errors), 90), 2),
        }

    @staticmethod
    def _build_procurement(errors: List[float], abs_errors: List[float]) -> dict:
        """Translate error into procurement energy exposure (MWh).

        Each matched period spans 0.5 h, so energy = power (MW) x 0.5.
        error = forecast - actual > 0 => wind short => desk must procure extra.
        """
        half_hour = 0.5
        shortfall = sum(e for e in errors if e > 0) * half_hour
        surplus = sum(-e for e in errors if e < 0) * half_hour
        total_gap = sum(abs_errors) * half_hour
        s_abs = sorted(abs_errors)
        p90 = (
            s_abs[min(int(0.9 * (len(s_abs) - 1)), len(s_abs) - 1)] if s_abs else 0.0
        )
        return {
            "shortfall_energy_mwh": round(shortfall, 1),
            "surplus_energy_mwh": round(surplus, 1),
            "total_gap_energy_mwh": round(total_gap, 1),
            "p90_buffer_mw": round(p90, 2),
        }

    # --------------------------------------------------------------- horizon
    async def get_horizon(self, start_date: str, end_date: str) -> dict:
        """Forecast MAE/bias as a function of lead time (how far ahead issued).

        Uses every WINDFOR revision against the matching actual, bucketing each
        (publishTime -> startTime) gap into lead-time bands. This shows how
        forecast skill decays with horizon — the core reason day-ahead error
        (made ~12-36 h before delivery) must be quantified separately.
        """
        start = _parse_dt(f"{start_date}T00:00:00Z")
        end = _parse_dt(f"{end_date}T23:59:59Z")
        async with self._lock:
            actuals, revisions = await self._get_raw(start_date, end_date)

        bands = [(0, 6), (6, 12), (12, 18), (18, 24), (24, 36), (36, 48)]
        buckets: Dict[Tuple[int, int], List[float]] = {b: [] for b in bands}

        for st, revs in revisions.items():
            if not (start <= st <= end):
                continue
            a = actuals.get(st)
            if a is None:
                continue
            for pub, gen in revs:
                lead_h = (st - pub).total_seconds() / 3600.0
                if lead_h < 0:
                    continue  # published after delivery (late revision) — skip
                for b in bands:
                    if b[0] <= lead_h < b[1]:
                        buckets[b].append(gen - a)
                        break

        out = []
        day_ahead_mae = None
        for b in bands:
            errs = buckets[b]
            if not errs:
                continue
            mae = sum(abs(e) for e in errs) / len(errs)
            bias = sum(errs) / len(errs)
            label = f"{b[0]}-{b[1]}h"
            out.append(
                {
                    "label": label,
                    "min_hours": float(b[0]),
                    "max_hours": float(b[1]),
                    "mae": round(mae, 2),
                    "bias": round(bias, 2),
                    "count": len(errs),
                }
            )
            if b == (24, 36):
                day_ahead_mae = round(mae, 2)

        if not out:
            raise ElexonServiceError("No forecast-revision data available for lead-time analysis.")

        return {
            "start_date": start_date,
            "end_date": end_date,
            "buckets": out,
            "day_ahead_mae": day_ahead_mae,
        }

    @staticmethod
    def _hourly_errors(matched: List[dict]) -> List[dict]:
        buckets: Dict[int, List[dict]] = defaultdict(list)
        for p in matched:
            buckets[p["start_time"].hour].append(p)
        out = []
        for hour in range(24):
            pts = buckets.get(hour, [])
            if not pts:
                out.append({"hour": hour, "mae": 0.0, "bias": 0.0, "count": 0})
                continue
            mae = sum(x["abs_error"] for x in pts) / len(pts)
            bias = sum(x["error"] for x in pts) / len(pts)
            out.append({"hour": hour, "mae": round(mae, 2), "bias": round(bias, 2), "count": len(pts)})
        return out

    @staticmethod
    def _daily_errors(matched: List[dict]) -> List[dict]:
        buckets: Dict[str, List[dict]] = defaultdict(list)
        for p in matched:
            buckets[p["start_time"].strftime("%Y-%m-%d")].append(p)
        out = []
        for date in sorted(buckets):
            pts = buckets[date]
            mae = sum(x["abs_error"] for x in pts) / len(pts)
            rmse = math.sqrt(sum(x["error"] ** 2 for x in pts) / len(pts))
            bias = sum(x["error"] for x in pts) / len(pts)
            out.append(
                {
                    "date": date,
                    "mae": round(mae, 2),
                    "rmse": round(rmse, 2),
                    "bias": round(bias, 2),
                    "count": len(pts),
                }
            )
        return out

    def cached_record_count(self) -> int:
        return sum(len(v[1]) for v in self._cache.values())


# Singleton used by the FastAPI app.
service = ElexonService()
