from typing import Optional

from pydantic import BaseModel, Field


class PredictionRequest(BaseModel):
    current_stock: int = Field(ge=0)
    min_required: int = Field(ge=0)
    max_capacity: int = Field(ge=0)
    unit_cost: float = Field(ge=0)
    # The item's own baseline daily usage -- provides the demand LEVEL, which
    # the model's seasonal multiplier then scales. This is what makes the
    # global model scale-invariant across hospitals of any size.
    avg_usage_per_day: float = Field(ge=0)
    restock_lead_time: int = Field(ge=0)
    item_name: str
    item_type: str
    # Seasonal profile + climate region -> selects the multiplier curve.
    demand_category: str = "general"
    region: str = "temperate"
    # ISO date the forecast is for; defaults to today (server side).
    prediction_date: Optional[str] = None


class PredictionResponse(BaseModel):
    predicted_avg_usage_per_day: float
    estimated_demand: float
    inventory_shortfall: float
    replenishment_needs: float
    shortage_risk: bool
    risk_ratio: float
    # Explainability: the seasonal factor applied and why.
    seasonal_multiplier: float
    demand_category: str
    region: str
    model_version: str
    model_confidence: float
