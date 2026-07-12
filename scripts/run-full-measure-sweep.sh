#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export FARM_MEASURE_WHISPER=1
export FARM_MEASURE_WHISPER_MODEL="${FARM_MEASURE_WHISPER_MODEL:-tiny}"
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export HF_HOME="$ROOT/tools/whisper/models"
export HUGGINGFACE_HUB_CACHE="$ROOT/tools/whisper/models/hub"
mkdir -p logs farm-output/metrics

echo "[sweep] matrix full $(date -u +%Y-%m-%dT%H:%M:%SZ)"
node scripts/farm-measure.js --batch matrix --concurrency 1 \
  > logs/measure-matrix-full.log 2>&1

echo "[sweep] catalog full $(date -u +%Y-%m-%dT%H:%M:%SZ)"
node scripts/farm-measure.js --batch catalog --primary --concurrency 1 \
  > logs/measure-catalog-full.log 2>&1

echo "[sweep] gates $(date -u +%Y-%m-%dT%H:%M:%SZ)"
node scripts/farm-gate.js --metrics farm-output/metrics/catalog-metrics.json \
  --out farm-output/metrics/gate-catalog.json > logs/gate-catalog.log 2>&1 || true
node scripts/farm-gate.js --metrics farm-output/metrics/matrix-metrics.json \
  --out farm-output/metrics/gate-matrix.json > logs/gate-matrix.log 2>&1 || true
# Primary gate = catalog (asPrimary)
node scripts/farm-gate.js --metrics farm-output/metrics/farm-metrics.json \
  --out farm-output/metrics/gate-result.json > logs/gate-result.log 2>&1 || true

node scripts/build-dashboard-data.js > logs/dashboard-build.log 2>&1 || true
echo "[sweep] COMPLETE $(date -u +%Y-%m-%dT%H:%M:%SZ)"
