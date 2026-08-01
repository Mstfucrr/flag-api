#!/usr/bin/env bash
# Load test için test projesi + flag'i oluşturur (idempotent — zaten varsa 409'u yutar).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
PROJECT_KEY="${PROJECT_KEY:-load-test}"
FLAG_KEY="${FLAG_KEY:-load-test-flag}"
FLAGS_API_KEY="${FLAGS_API_KEY:-}"

echo "Project oluşturuluyor: ${PROJECT_KEY}"
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/admin/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Load Test\",\"key\":\"${PROJECT_KEY}\"}" || true

echo "Flag oluşturuluyor: ${PROJECT_KEY}/${FLAG_KEY}"
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/admin/projects/${PROJECT_KEY}/flags" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${FLAGS_API_KEY}" \
  -d "{
    \"key\": \"${FLAG_KEY}\",
    \"description\": \"k6 load test flag\",
    \"enabled\": true,
    \"rules\": [
      {
        \"id\": \"cond-1\",
        \"active\": true,
        \"filters\": [
          { \"id\": \"f-1\", \"field\": \"accountId\", \"operator\": \"contains\", \"value\": \"loadtest-\" }
        ]
      }
    ]
  }" || true

echo "Hazır. Şimdi: k6 run scripts/loadtest/evaluate.js (BASE_URL/PROJECT_KEY/FLAG_KEY aynı olmalı)"
