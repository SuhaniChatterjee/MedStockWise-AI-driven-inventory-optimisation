import json
import os
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from .schemas import PredictionRequest

MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).resolve().parents[3] / "ml" / "models"))


class DemandModel:
    """
    Loads the LightGBM booster trained by ml/train.py and reproduces its
    exact feature encoding at inference time, so predictions match what the
    training pipeline evaluated.
    """

    def __init__(self, model_dir: Path = MODEL_DIR):
        schema_path = model_dir / "feature_schema.json"
        model_path = model_dir / "demand_regressor.txt"
        metrics_path = model_dir / "metrics.json"

        if not schema_path.exists() or not model_path.exists():
            raise FileNotFoundError(
                f"Model artifacts not found in {model_dir}. Run `python3 ml/train.py` "
                "from the repo root first, or set MODEL_DIR to point at them."
            )

        self.schema = json.loads(schema_path.read_text())
        self.metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
        self.booster = lgb.Booster(model_file=str(model_path))
        self.feature_columns: list[str] = self.schema["feature_columns"]
        self.risk_threshold: float = self.schema.get("risk_threshold", 1.0)
        self.item_names: list[str] = self.schema["categorical_source_columns"]["Item_Name"]
        self.item_types: list[str] = self.schema["categorical_source_columns"]["Item_Type"]

        test_r2 = self.metrics.get("selected_model_metrics", {}).get("r2", 0.0)
        self.model_confidence: float = max(0.0, min(1.0, test_r2))

    def _sanitize(self, name: str) -> str:
        import re
        return re.sub(r"[^A-Za-z0-9_]", "_", name)

    def _build_features(self, req: PredictionRequest) -> pd.DataFrame:
        observed_at = (
            datetime.fromisoformat(req.observed_at) if req.observed_at else datetime.now(timezone.utc)
        )

        history = sorted(req.history, key=lambda h: h.observed_at)
        if history:
            usages = [h.avg_usage_per_day for h in history]
            lag_1 = usages[-1]
            lag_3 = usages[-3] if len(usages) >= 3 else 0.0
            lag_7 = usages[-7] if len(usages) >= 7 else 0.0
            rolling_7 = float(np.mean(usages[-7:]))
            last_obs_date = datetime.fromisoformat(history[-1].observed_at)
            days_since_prev = max((observed_at - last_obs_date).days, 0)
        else:
            # Cold start: no recorded history for this item yet. Use today's
            # reading as its own best-guess lag rather than an arbitrary
            # zero, and assume a 1-day gap (see docs/ml-pipeline.md).
            lag_1 = lag_3 = lag_7 = rolling_7 = req.avg_usage_per_day
            days_since_prev = 1

        row = {
            "Current_Stock": req.current_stock,
            "Min_Required": req.min_required,
            "Max_Capacity": req.max_capacity,
            "Unit_Cost": req.unit_cost,
            "Restock_Lead_Time": req.restock_lead_time,
            "Usage_Lag_1": lag_1,
            "Usage_Lag_3": lag_3,
            "Usage_Lag_7": lag_7,
            "Usage_Rolling_7": rolling_7,
            "Days_Since_Prev_Obs": days_since_prev,
            "Day_Of_Week": observed_at.weekday(),
            "Month": observed_at.month,
            "Is_Weekend": int(observed_at.weekday() >= 5),
            "Quarter": (observed_at.month - 1) // 3 + 1,
        }

        for name in self.item_names:
            row[self._sanitize(f"Item_Name_{name}")] = 1 if req.item_name == name else 0
        for t in self.item_types:
            row[self._sanitize(f"Item_Type_{t}")] = 1 if req.item_type == t else 0

        frame = pd.DataFrame([row])
        # Reindex to the exact training column order/set; any dummy column
        # for a category unseen at training time is simply left at 0.
        for col in self.feature_columns:
            if col not in frame.columns:
                frame[col] = 0
        return frame[self.feature_columns], len(history)

    def predict(self, req: PredictionRequest) -> dict:
        X, history_points = self._build_features(req)

        predicted_usage = float(self.booster.predict(X)[0])
        predicted_usage = max(predicted_usage, 0.0)

        contributions_raw = self.booster.predict(X, pred_contrib=True)[0]
        feature_contributions = {
            col: round(float(val), 4) for col, val in zip(self.feature_columns, contributions_raw[:-1])
        }

        estimated_demand = predicted_usage * req.restock_lead_time
        inventory_shortfall = max(0.0, req.min_required - req.current_stock)
        replenishment_needs = max(0.0, estimated_demand - req.current_stock)

        buffer = req.current_stock - req.min_required
        risk_ratio = estimated_demand / max(buffer, 1)
        shortage_risk = risk_ratio > self.risk_threshold

        return {
            "predicted_avg_usage_per_day": round(predicted_usage, 2),
            "estimated_demand": round(estimated_demand, 2),
            "inventory_shortfall": round(inventory_shortfall, 2),
            "replenishment_needs": round(replenishment_needs, 2),
            "shortage_risk": bool(shortage_risk),
            "risk_ratio": round(float(risk_ratio), 4),
            "feature_contributions": feature_contributions,
            "model_version": self.metrics.get("selected_model", "unknown"),
            "model_type": self.schema.get("model_type", "unknown"),
            "used_history_points": history_points,
            "model_confidence": round(self.model_confidence, 4),
        }
