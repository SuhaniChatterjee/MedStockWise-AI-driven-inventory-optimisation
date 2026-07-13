from typing import Literal, Optional

from pydantic import BaseModel, Field


class UsageObservation(BaseModel):
    observed_at: str
    avg_usage_per_day: float


class PredictionRequest(BaseModel):
    current_stock: int = Field(ge=0)
    min_required: int = Field(ge=0)
    max_capacity: int = Field(ge=0)
    unit_cost: float = Field(ge=0)
    avg_usage_per_day: float = Field(ge=0)
    restock_lead_time: int = Field(ge=0)
    item_type: Literal["Equipment", "Consumable"]
    item_name: str
    observed_at: Optional[str] = None
    # Prior observations for this item, most recent last. Empty/omitted for
    # items with no recorded history yet (cold start).
    history: list[UsageObservation] = Field(default_factory=list)


class PredictionResponse(BaseModel):
    predicted_avg_usage_per_day: float
    estimated_demand: float
    inventory_shortfall: float
    replenishment_needs: float
    shortage_risk: bool
    risk_ratio: float
    feature_contributions: dict[str, float]
    model_version: str
    model_type: str
    used_history_points: int
    # Model-level confidence derived from the selected model's held-out test
    # R² (clamped to [0, 1]), not a per-prediction certainty estimate --
    # LightGBM's point predictions don't natively carry one without a
    # separate quantile model. Honest but coarse: see ml/README.md.
    model_confidence: float
