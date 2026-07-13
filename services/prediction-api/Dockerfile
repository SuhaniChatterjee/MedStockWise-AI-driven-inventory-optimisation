# Build from the repo root so this can COPY the trained model artifacts:
#   docker build -f services/prediction-api/Dockerfile -t medstockwise-prediction-api .
FROM python:3.11-slim

WORKDIR /app

# libgomp1 (OpenMP runtime) is required by LightGBM's compiled binary at
# import time -- python:3.11-slim doesn't include it, and lightgbm fails
# with "OSError: libgomp.so.1: cannot open shared object file" without it.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/prediction-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/prediction-api/app ./app
COPY ml/models ./ml/models

ENV MODEL_DIR=/app/ml/models
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
