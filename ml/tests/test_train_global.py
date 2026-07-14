"""
Run with: python3 -m pytest ml/ (from the repo root)

Focused on the properties that matter for a leak-free, zero-shot global
model: the ATC->category mapping is total, no future leakage in the lag
features, no location/hospital identity leaks into the feature set, and the
pipeline is deterministic.
"""
import numpy as np
import pandas as pd
import pytest

from train_global import (
    ATC_TO_CATEGORY,
    DEMAND_CATEGORIES,
    WEATHER_COLS,
    add_features,
    add_weather,
    build_matrix,
    load_long_demand,
    wape,
)


@pytest.fixture(scope="module")
def featured():
    return add_features(add_weather(load_long_demand()))


def test_all_eight_atc_codes_are_mapped():
    # The 8 ATC columns in the pharma dataset must all map to a category.
    expected_atc = {"M01AB", "M01AE", "N02BA", "N02BE", "N05B", "N05C", "R03", "R06"}
    assert set(ATC_TO_CATEGORY.keys()) == expected_atc


def test_opposite_seasonality_drugs_are_not_merged():
    # R03 (winter airway) and R06 (spring allergy) have opposite seasonality;
    # merging them would cancel the signal, so they must be distinct categories.
    assert ATC_TO_CATEGORY["R03"] != ATC_TO_CATEGORY["R06"]


def test_long_reshape_covers_every_category_every_day(featured):
    counts = featured.groupby("demand_category")["date"].nunique()
    # Every category should have (roughly) the full daily series -- within a
    # few days of each other (they share the same date range).
    assert counts.min() > 0
    assert counts.max() - counts.min() <= 1


def test_lag_1_never_uses_future_demand(featured):
    for _, group in featured.groupby("demand_category"):
        g = group.sort_values("date").reset_index(drop=True)
        if len(g) < 3:
            continue
        # lag_1 at row i must equal demand at row i-1 (the prior observation),
        # never the current or a future one.
        expected = g["demand"].shift(1).iloc[1:]
        actual = g["lag_1"].iloc[1:]
        # first row of each category was dropped (no lag), so realign
        pd.testing.assert_series_equal(
            expected.reset_index(drop=True).iloc[1:].reset_index(drop=True),
            actual.reset_index(drop=True).iloc[1:].reset_index(drop=True),
            check_names=False,
        )


def test_no_location_or_hospital_identity_in_features(featured):
    _, _, feature_cols = build_matrix(featured, use_weather=True)
    joined = " ".join(feature_cols).lower()
    for banned in ["hospital", "region", "city", "lat", "lon", "location"]:
        assert banned not in joined, f"feature leak: '{banned}' in {feature_cols}"


def test_weather_columns_present_only_when_requested(featured):
    _, _, with_w = build_matrix(featured, use_weather=True)
    _, _, without_w = build_matrix(featured, use_weather=False)
    assert all(c in with_w for c in WEATHER_COLS)
    assert not any(c in without_w for c in WEATHER_COLS)


def test_category_one_hots_are_mutually_exclusive(featured):
    X, _, _ = build_matrix(featured, use_weather=True)
    cat_cols = [f"cat_{c}" for c in DEMAND_CATEGORIES]
    # Exactly one category flag set per row.
    assert (X[cat_cols].sum(axis=1) == 1).all()


def test_build_matrix_is_deterministic(featured):
    X1, y1, _ = build_matrix(featured, use_weather=True)
    X2, y2, _ = build_matrix(featured, use_weather=True)
    pd.testing.assert_frame_equal(X1, X2)
    pd.testing.assert_series_equal(y1, y2)


def test_wape_handles_zero_actuals():
    # WAPE divides by the SUM of actuals, so it stays finite even when some
    # individual actuals are zero (the whole point of using it over MAPE here).
    result = wape(np.array([0.0, 10.0]), np.array([1.0, 10.0]))
    assert np.isfinite(result)
    # |0-1| + |10-10| = 1, over sum 10 -> 10%
    assert result == pytest.approx(10.0)
