"""Unit tests for the forecast-accuracy maths.

Every expected value here is worked out by hand in the test body, so a reviewer
can verify the statistics without trusting the implementation.

Run:  pytest -v
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

import pytest

from elexon_service import GATE_CLOSURE_HOUR_UTC, ElexonService, _parse_dt


def dt(iso: str) -> datetime:
    return _parse_dt(iso)


@pytest.fixture
def svc() -> ElexonService:
    return ElexonService()


# --------------------------------------------------------------- timestamps
def test_parse_dt_returns_utc_aware():
    d = dt("2026-01-05T13:30:00Z")
    assert d.tzinfo is not None
    assert d.utcoffset().total_seconds() == 0
    assert (d.year, d.month, d.day, d.hour, d.minute) == (2026, 1, 5, 13, 30)


def test_gate_closure_is_11utc_day_before_delivery(svc):
    """A period delivered on 5 Jan is traded at the 4 Jan 11:00 UTC gate."""
    gate = svc._gate_closure(dt("2026-01-05T18:00:00Z"))
    assert gate == datetime(2026, 1, 4, GATE_CLOSURE_HOUR_UTC, 0, tzinfo=timezone.utc)


def test_gate_closure_handles_month_boundary(svc):
    """Delivery on 1 Feb is traded at the 31 Jan gate."""
    gate = svc._gate_closure(dt("2026-02-01T00:00:00Z"))
    assert gate == datetime(2026, 1, 31, GATE_CLOSURE_HOUR_UTC, 0, tzinfo=timezone.utc)


# ------------------------------------------------------- forecast selection
def test_selects_latest_revision_before_gate_closure(svc):
    """Three revisions; only the two before the gate are eligible, latest wins."""
    target = dt("2026-01-05T12:00:00Z")  # gate = 2026-01-04 11:00Z
    revisions = {
        target: [
            (dt("2026-01-03T06:00:00Z"), 1000.0),  # eligible, older
            (dt("2026-01-04T09:00:00Z"), 2000.0),  # eligible, latest before gate -> WIN
            (dt("2026-01-05T06:00:00Z"), 3000.0),  # after gate, must be ignored
        ]
    }
    gen, pub = svc._select_day_ahead(revisions)[target]
    assert gen == 2000.0
    assert pub == dt("2026-01-04T09:00:00Z")


def test_falls_back_to_pre_delivery_revision_when_none_before_gate(svc):
    """If nothing was published before the gate, use the latest pre-delivery one."""
    target = dt("2026-01-05T12:00:00Z")
    revisions = {
        target: [
            (dt("2026-01-05T04:00:00Z"), 1500.0),
            (dt("2026-01-05T08:00:00Z"), 1800.0),  # latest before delivery -> WIN
        ]
    }
    gen, pub = svc._select_day_ahead(revisions)[target]
    assert gen == 1800.0
    assert pub == dt("2026-01-05T08:00:00Z")


# -------------------------------------------------------------- core metrics
def _matched(errors, actuals):
    """Build the minimal matched-point dicts the metric helpers consume."""
    base = dt("2026-01-05T00:00:00Z")
    out = []
    for i, (e, a) in enumerate(zip(errors, actuals)):
        out.append(
            {
                "start_time": base.replace(hour=i % 24),
                "actual": a,
                "forecast": a + e,
                "error": e,
                "abs_error": abs(e),
            }
        )
    return out


def test_mae_rmse_bias_hand_worked():
    """errors = [+100, -200, +300, -400] over actuals of 1000 each.

    MAE  = (100+200+300+400)/4               = 250
    Bias = (100-200+300-400)/4               = -50
    RMSE = sqrt((100^2+200^2+300^2+400^2)/4)
         = sqrt((10000+40000+90000+160000)/4)
         = sqrt(75000)                        ~ 273.861
    """
    errors = [100.0, -200.0, 300.0, -400.0]
    n = len(errors)
    mae = sum(abs(e) for e in errors) / n
    bias = sum(errors) / n
    rmse = math.sqrt(sum(e * e for e in errors) / n)

    assert mae == 250.0
    assert bias == -50.0
    assert rmse == pytest.approx(math.sqrt(75000), rel=1e-9)
    assert rmse == pytest.approx(273.8612787, rel=1e-6)


def test_bias_pct_is_signed_share_of_mean_actual():
    """bias = +500 MW on mean actual 10,000 MW => +5% (over-forecast)."""
    errors = [500.0, 500.0]
    actuals = [10000.0, 10000.0]
    bias = sum(errors) / len(errors)
    mean_actual = sum(actuals) / len(actuals)
    assert bias / mean_actual * 100.0 == pytest.approx(5.0)


def test_rmse_is_never_below_mae():
    """Mathematical invariant: RMSE >= MAE for any error vector."""
    for errors in ([10.0, -10.0], [1.0, 5.0, 100.0], [0.0, 0.0, 7.0]):
        n = len(errors)
        mae = sum(abs(e) for e in errors) / n
        rmse = math.sqrt(sum(e * e for e in errors) / n)
        assert rmse >= mae - 1e-12


# --------------------------------------------------------------- percentiles
def test_percentile_interpolates(svc):
    """On [0,10,20,30,40]: P50 is the exact middle (20); P10 interpolates to 4."""
    vals = [0.0, 10.0, 20.0, 30.0, 40.0]
    assert svc._percentile(vals, 50) == pytest.approx(20.0)
    assert svc._percentile(vals, 0) == pytest.approx(0.0)
    assert svc._percentile(vals, 100) == pytest.approx(40.0)
    # rank = 0.10 * 4 = 0.4 -> 0*(0.6) + 10*(0.4) = 4
    assert svc._percentile(vals, 10) == pytest.approx(4.0)


def test_percentile_edge_cases(svc):
    assert svc._percentile([], 50) == 0.0
    assert svc._percentile([42.0], 90) == 42.0


# -------------------------------------------------------------- distribution
def test_distribution_bins_cover_all_samples(svc):
    errors = [-500.0, -100.0, 0.0, 100.0, 500.0, 900.0]
    dist = svc._build_distribution(errors, [abs(e) for e in errors])
    assert sum(b["count"] for b in dist["bins"]) == len(errors)
    # Bins must span the full observed range.
    assert dist["bins"][0]["bin_start"] == pytest.approx(min(errors), abs=0.1)
    assert dist["bins"][-1]["bin_end"] == pytest.approx(max(errors), abs=0.1)
    assert dist["p50"] == pytest.approx(50.0)


# -------------------------------------------------------------- procurement
def test_procurement_energy_split_and_half_hour_conversion(svc):
    """errors=[+1000,-400,+200] MW over 30-min periods.

    Each period is 0.5 h, so energy = MW * 0.5.
      shortfall (e>0) = (1000+200)*0.5 = 600 MWh
      surplus   (e<0) = 400*0.5        = 200 MWh
      total gap       = 1600*0.5       = 800 MWh
    """
    errors = [1000.0, -400.0, 200.0]
    proc = svc._build_procurement(errors, [abs(e) for e in errors])
    assert proc["shortfall_energy_mwh"] == pytest.approx(600.0)
    assert proc["surplus_energy_mwh"] == pytest.approx(200.0)
    assert proc["total_gap_energy_mwh"] == pytest.approx(800.0)
    # Identity: shortfall + surplus == total gap.
    assert proc["shortfall_energy_mwh"] + proc["surplus_energy_mwh"] == pytest.approx(
        proc["total_gap_energy_mwh"]
    )


# ------------------------------------------------------------ hourly / daily
def test_hourly_errors_bucket_by_hour_and_cover_24_slots():
    errors = [100.0, 300.0]
    actuals = [1000.0, 1000.0]
    matched = _matched(errors, actuals)
    # Force both points into hour 3 so the bucket mean is checkable by hand.
    for m in matched:
        m["start_time"] = m["start_time"].replace(hour=3)

    hourly = ElexonService._hourly_errors(matched)
    assert len(hourly) == 24  # every hour slot present, even when empty
    h3 = next(h for h in hourly if h["hour"] == 3)
    assert h3["count"] == 2
    assert h3["mae"] == pytest.approx(200.0)  # (100+300)/2
    assert h3["bias"] == pytest.approx(200.0)
    h5 = next(h for h in hourly if h["hour"] == 5)
    assert h5["count"] == 0 and h5["mae"] == 0.0


def test_daily_errors_group_by_date():
    """Two days: day A errors [+100,+300] -> MAE 200; day B [-50] -> MAE 50."""
    matched = [
        {
            "start_time": dt("2026-01-05T01:00:00Z"),
            "actual": 1000.0, "forecast": 1100.0, "error": 100.0, "abs_error": 100.0,
        },
        {
            "start_time": dt("2026-01-05T02:00:00Z"),
            "actual": 1000.0, "forecast": 1300.0, "error": 300.0, "abs_error": 300.0,
        },
        {
            "start_time": dt("2026-01-06T01:00:00Z"),
            "actual": 1000.0, "forecast": 950.0, "error": -50.0, "abs_error": 50.0,
        },
    ]
    daily = ElexonService._daily_errors(matched)
    assert [d["date"] for d in daily] == ["2026-01-05", "2026-01-06"]
    assert daily[0]["mae"] == pytest.approx(200.0)
    assert daily[0]["bias"] == pytest.approx(200.0)
    # Implementation rounds to 2 dp, so compare at that tolerance.
    assert daily[0]["rmse"] == pytest.approx(math.sqrt((100**2 + 300**2) / 2), abs=0.01)
    assert daily[1]["mae"] == pytest.approx(50.0)
    assert daily[1]["count"] == 1
