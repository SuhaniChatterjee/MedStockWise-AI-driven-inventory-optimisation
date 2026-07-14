"""
Tests for the seasonal-multiplier serving logic.
Run: python3 -m pytest services/prediction-api/
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.model import DemandModel  # noqa: E402
from app.schemas import PredictionRequest  # noqa: E402


@pytest.fixture(scope="module")
def model():
    return DemandModel()


def _req(**kw):
    base = dict(
        current_stock=180, min_required=200, max_capacity=500, unit_cost=50,
        avg_usage_per_day=100, restock_lead_time=10, item_name="X", item_type="Consumable",
        demand_category="general", region="temperate",
    )
    base.update(kw)
    return PredictionRequest(**base)


def test_general_category_has_no_seasonality(model):
    jan = model.predict(_req(demand_category="general", prediction_date="2026-01-15"))
    jul = model.predict(_req(demand_category="general", prediction_date="2026-07-15"))
    assert jan["seasonal_multiplier"] == 1.0
    assert jul["seasonal_multiplier"] == 1.0
    assert jan["predicted_avg_usage_per_day"] == jul["predicted_avg_usage_per_day"]


def test_respiratory_peaks_in_winter(model):
    jan = model.predict(_req(demand_category="respiratory_airway", prediction_date="2026-01-15"))
    jul = model.predict(_req(demand_category="respiratory_airway", prediction_date="2026-07-15"))
    # Cold-season respiratory demand should be materially higher in winter.
    assert jan["seasonal_multiplier"] > jul["seasonal_multiplier"]
    assert jan["estimated_demand"] > jul["estimated_demand"]


def test_multiplier_scales_the_items_own_baseline(model):
    # Same category/date, different baseline -> forecast scales linearly, so the
    # model is scale-invariant across hospitals of different sizes.
    small = model.predict(_req(avg_usage_per_day=10, demand_category="respiratory_airway", prediction_date="2026-01-15"))
    big = model.predict(_req(avg_usage_per_day=1000, demand_category="respiratory_airway", prediction_date="2026-01-15"))
    assert small["seasonal_multiplier"] == big["seasonal_multiplier"]
    ratio = big["predicted_avg_usage_per_day"] / small["predicted_avg_usage_per_day"]
    assert ratio == pytest.approx(100.0, rel=1e-3)


def test_unknown_region_falls_back_to_flat(model):
    r = model.predict(_req(demand_category="allergy", region="atlantis", prediction_date="2026-05-15"))
    assert r["seasonal_multiplier"] == 1.0


def test_leap_day_is_clamped(model):
    # day-of-year 366 must not index past the 365-length curve.
    r = model.predict(_req(demand_category="allergy", prediction_date="2024-12-31"))
    assert r["seasonal_multiplier"] > 0
