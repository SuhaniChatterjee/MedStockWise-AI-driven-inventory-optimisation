import logging
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .model import DemandModel
from .schemas import PredictionRequest, PredictionResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prediction-api")

API_KEY = os.environ.get("PREDICTION_API_KEY")
if not API_KEY:
    logger.warning(
        "PREDICTION_API_KEY is not set -- /predict is unauthenticated. "
        "Set this env var before deploying publicly."
    )

app = FastAPI(
    title="MedStockWise Prediction API",
    description="Serves the LightGBM demand-forecasting model trained by ml/train.py.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

model: DemandModel | None = None


@app.on_event("startup")
def load_model() -> None:
    global model
    model = DemandModel()
    logger.info("Loaded model: %s", model.metrics.get("selected_model", "unknown"))


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.get("/model-info")
def model_info(_: None = Depends(require_api_key)):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {
        "model_type": model.schema.get("model_type"),
        "feature_columns": model.feature_columns,
        "risk_threshold": model.risk_threshold,
        "metrics": model.metrics,
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: PredictionRequest, _: None = Depends(require_api_key)):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    try:
        return model.predict(payload)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc
