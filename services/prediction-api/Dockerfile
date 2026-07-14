# Build from the repo root so this can COPY the trained model artifacts:
#   docker build -f services/prediction-api/Dockerfile -t medstockwise-prediction-api .
FROM python:3.11-slim

WORKDIR /app

# Serving is now a pure-Python curve lookup (no LightGBM/pandas), so no
# libgomp / system deps are needed -- the container is much lighter than the
# earlier model-inference version.
COPY services/prediction-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/prediction-api/app ./app
# Only the distilled curves are needed at serving time, not the raw model.
COPY ml/models/seasonal_multipliers.json ./ml/models/seasonal_multipliers.json

ENV MODEL_DIR=/app/ml/models
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
