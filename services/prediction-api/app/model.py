import json
import os
from datetime import date, datetime
from pathlib import Path

from .schemas import PredictionRequest

# os.environ.get(name, default) evaluates `default` unconditionally, and the
# parents[3] local-dev fallback doesn't resolve in the Docker image's flatter
# /app/app/model.py layout (where MODEL_DIR is always set anyway). Keep it lazy.
_model_dir_env = os.environ.get("MODEL_DIR")
MODEL_DIR = Path(_model_dir_env) if _model_dir_env else Path(__file__).resolve().parents[3] / "ml" / "models"

# Holdout R2 of the global model (see ml/models/global_metrics.json). Reported
# as a coarse, honest model-level confidence -- not a per-prediction estimate.
GLOBAL_MODEL_R2 = 0.71


class DemandModel:
    """
    Serves the global demand model as pre-distilled per-(category, region)
    seasonal multiplier curves (ml/models/seasonal_multipliers.json, produced
    by ml/export_seasonal_curves.py). Serving is deliberately just a curve
    lookup + arithmetic -- no LightGBM/pandas at inference:

        forecast_daily = item_baseline_usage * seasonal_multiplier
        estimated_demand_over_lead_time = forecast_daily * restock_lead_time

    The multiplier carries the seasonal/weather SHAPE (learned from real data);
    the item's own baseline carries the LEVEL, so this transfers to any
    hospital item at any scale with no retraining. See ml/README.md.
    """

    def __init__(self, model_dir: Path = MODEL_DIR):
        curves_path = model_dir / "seasonal_multipliers.json"
        if not curves_path.exists():
            raise FileNotFoundError(
                f"seasonal_multipliers.json not found in {model_dir}. Run "
                "`python3 ml/train_global.py && python3 ml/export_seasonal_curves.py` first, "
                "or set MODEL_DIR to point at them."
            )
        self.data = json.loads(curves_path.read_text())
        self.curves = self.data["curves"]
        self.regions = set(self.data["regions"])
        self.categories = set(self.data["categories"])

    def seasonal_multiplier(self, demand_category: str, region: str, on: date) -> float:
        # 'general' or any unknown category/region -> no seasonal adjustment.
        if demand_category not in self.categories or region not in self.regions:
            return 1.0
        curve = self.curves[demand_category][region]
        doy = min(on.timetuple().tm_yday, len(curve))  # clamp leap day 366 -> 365
        return float(curve[doy - 1])

    def predict(self, req: PredictionRequest) -> dict:
        on = (
            datetime.fromisoformat(req.prediction_date).date()
            if req.prediction_date
            else date.today()
        )
        multiplier = self.seasonal_multiplier(req.demand_category, req.region, on)

        predicted_usage = req.avg_usage_per_day * multiplier
        estimated_demand = predicted_usage * req.restock_lead_time
        inventory_shortfall = max(0.0, req.min_required - req.current_stock)
        replenishment_needs = max(0.0, estimated_demand - req.current_stock)

        buffer = req.current_stock - req.min_required
        risk_ratio = estimated_demand / max(buffer, 1)
        shortage_risk = risk_ratio > 1.0

        return {
            "predicted_avg_usage_per_day": round(predicted_usage, 2),
            "estimated_demand": round(estimated_demand, 2),
            "inventory_shortfall": round(inventory_shortfall, 2),
            "replenishment_needs": round(replenishment_needs, 2),
            "shortage_risk": bool(shortage_risk),
            "risk_ratio": round(float(risk_ratio), 4),
            "seasonal_multiplier": round(multiplier, 4),
            "demand_category": req.demand_category,
            "region": req.region,
            "model_version": "global-v1",
            "model_confidence": GLOBAL_MODEL_R2,
        }
