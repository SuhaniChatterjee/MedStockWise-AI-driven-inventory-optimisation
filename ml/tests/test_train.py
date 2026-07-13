"""
Run with: python3 -m pytest ml/ (from the repo root)

Focused on the properties that matter most for a time-series pipeline:
no leakage in the lag/rolling features, and stable/reproducible output --
not on re-verifying sklearn/lightgbm's own correctness.
"""
import numpy as np
import pandas as pd
import pytest

from train import (
    RISK_THRESHOLD,
    build_feature_matrix,
    load_and_engineer_features,
    safe_mape,
    sanitize_columns,
)


@pytest.fixture(scope="module")
def engineered_df():
    return load_and_engineer_features()


def test_no_missing_values_in_engineered_features(engineered_df):
    feature_cols = [
        "Usage_Lag_1", "Usage_Lag_3", "Usage_Lag_7", "Usage_Rolling_7", "Days_Since_Prev_Obs",
    ]
    assert engineered_df[feature_cols].isna().sum().sum() == 0


def test_lag_1_never_leaks_future_information(engineered_df):
    """Usage_Lag_1 for a given (item, date) must equal that item's own
    Avg_Usage_Per_Day from its immediately preceding observation -- never
    the current row's own value or a later one."""
    for item_name, group in engineered_df.groupby("Item_Name"):
        group = group.sort_values("Date").reset_index(drop=True)
        if len(group) < 2:
            continue
        expected_lag_1 = group["Avg_Usage_Per_Day"].shift(1).iloc[1:]
        actual_lag_1 = group["Usage_Lag_1"].iloc[1:]
        pd.testing.assert_series_equal(
            expected_lag_1.reset_index(drop=True),
            actual_lag_1.reset_index(drop=True),
            check_names=False,
        )


def test_days_since_prev_obs_is_nonnegative_and_matches_date_diff(engineered_df):
    assert (engineered_df["Days_Since_Prev_Obs"] >= 0).all()

    for item_name, group in engineered_df.groupby("Item_Name"):
        group = group.sort_values("Date").reset_index(drop=True)
        if len(group) < 2:
            continue
        expected_gap = group["Date"].diff().dt.days.iloc[1:]
        actual_gap = group["Days_Since_Prev_Obs"].iloc[1:]
        assert (expected_gap.reset_index(drop=True) == actual_gap.reset_index(drop=True)).all()


def test_rows_sorted_by_date_globally_for_temporal_split(engineered_df):
    dates = engineered_df["Date"].tolist()
    assert dates == sorted(dates)


def test_build_feature_matrix_is_deterministic(engineered_df):
    X1, y1 = build_feature_matrix(engineered_df)
    X2, y2 = build_feature_matrix(engineered_df)
    pd.testing.assert_frame_equal(X1, X2)
    pd.testing.assert_series_equal(y1, y2)


def test_build_feature_matrix_drops_raw_date_and_target_columns(engineered_df):
    X, _ = build_feature_matrix(engineered_df)
    assert "Date" not in X.columns
    assert "Avg_Usage_Per_Day" not in X.columns


def test_sanitize_columns_strips_special_characters():
    assert sanitize_columns(["Item Name_X-ray Machine", "a/b"]) == [
        "Item_Name_X_ray_Machine",
        "a_b",
    ]


def test_safe_mape_matches_hand_computed_value():
    y_true = np.array([100.0, 200.0])
    y_pred = np.array([110.0, 180.0])
    # |110-100|/100 = 0.10, |180-200|/200 = 0.10 -> mean 0.10 -> 10%
    assert safe_mape(y_true, y_pred) == pytest.approx(10.0)


def test_safe_mape_handles_zero_actuals_without_dividing_by_zero():
    y_true = np.array([0.0, 100.0])
    y_pred = np.array([5.0, 100.0])
    result = safe_mape(y_true, y_pred)
    assert np.isfinite(result)


def test_risk_threshold_is_the_documented_non_arbitrary_value():
    # See ml/README.md: risk_ratio > 1.0 means predicted demand over lead
    # time exceeds the available buffer -- fixed a priori, not tuned
    # against the test set.
    assert RISK_THRESHOLD == 1.0
