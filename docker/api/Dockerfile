FROM node:20-alpine AS landing-builder

WORKDIR /landing

COPY src/web/landing/package.json src/web/landing/package-lock.json* ./

RUN npm ci

COPY src/web/landing/ ./

RUN npm run build

FROM python:3.12-slim AS cpu-runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl gcc g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

COPY requirements/base.txt requirements/api.txt ./requirements/

RUN pip install --no-cache-dir -r requirements/api.txt

COPY . .

COPY --from=landing-builder /landing/dist ./src/web/landing/dist

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
