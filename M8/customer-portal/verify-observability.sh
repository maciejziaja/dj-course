#!/usr/bin/env bash
#
# verify-observability.sh
#
# Verifies the complete observability setup for Deliveroo Customer Portal:
#   1. Starts the stack (docker compose up -d) and waits for services to be ready
#   2. Checks the Nuxt app + /metrics endpoint (HTTP instrumentation)
#   3. Generates traffic (including errors) and verifies request duration
#      metrics, error counters and the error growth rate in Prometheus
#   4. Checks node-exporter (resource metrics) and mongodb-exporter
#   5. Checks Prometheus targets (all must be "up")
#   6. Checks Loki + application logs collected by Promtail
#   7. Checks Grafana: health, datasources and the provisioned dashboard
#
# Usage:
#   ./verify-observability.sh            # full run (with docker compose up)
#   SKIP_UP=1 ./verify-observability.sh  # skip bringing the stack up (already running)

set -u

cd "$(dirname "$0")"

APP_URL="http://localhost:4003"
PROM_URL="http://localhost:9090"
LOKI_URL="http://localhost:3100"
GRAFANA_URL="http://localhost:3001"
GRAFANA_AUTH="admin:admin"
MONGO_EXPORTER_URL="http://localhost:9216"

PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

check() { # check <description> <command...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    green "  ✔ $desc"; PASS=$((PASS+1))
  else
    red   "  ✘ $desc"; FAIL=$((FAIL+1))
  fi
}

# curl wrapper that succeeds only for HTTP 2xx/3xx
curl_ok() { curl -fsS --max-time 10 "$@"; }

# Waits until a command starts returning success (timeout in seconds)
wait_for() { # wait_for <description> <timeout_s> <command...>
  local desc="$1" timeout="$2"; shift 2
  local waited=0
  printf '  … waiting for %s ' "$desc"
  while ! "$@" >/dev/null 2>&1; do
    if [ "$waited" -ge "$timeout" ]; then
      echo; red "  ✘ TIMEOUT (${timeout}s): $desc"; FAIL=$((FAIL+1)); return 1
    fi
    sleep 2; waited=$((waited+2)); printf '.'
  done
  echo; green "  ✔ $desc ready (after ~${waited}s)"; PASS=$((PASS+1))
}

# Instant query against Prometheus; succeeds when it returns >=1 result
prom_has_result() { # prom_has_result <promql>
  curl -fsS --max-time 10 -G "$PROM_URL/api/v1/query" --data-urlencode "query=$1" \
    | grep -q '"result":\[{'
}

# ------------------------------------------------------------------
bold "== 1. Starting the stack (docker compose) =="
if [ "${SKIP_UP:-0}" != "1" ]; then
  # -V (--renew-anon-volumes): refreshes the anonymous /app/node_modules volume,
  # so that after an image rebuild it doesn't keep old native binaries (e.g. esbuild)
  docker compose up -d --build -V || { red "docker compose up failed"; exit 1; }
else
  echo "  (SKIP_UP=1 — skipping docker compose up)"
fi

bold "== 2. Service readiness =="
wait_for "MongoDB (healthcheck)" 120 \
  sh -c 'docker inspect -f "{{.State.Health.Status}}" cp-mongodb-container | grep -q healthy'
wait_for "Nuxt app ($APP_URL)" 180 curl_ok "$APP_URL/"
wait_for "Prometheus" 60 curl_ok "$PROM_URL/-/ready"
wait_for "Loki" 90 curl_ok "$LOKI_URL/ready"
wait_for "Grafana" 90 curl_ok "$GRAFANA_URL/api/health"

bold "== 3. Nuxt application instrumentation =="
check "/metrics endpoint responds" curl_ok "$APP_URL/metrics"
check "request counter metric (cp_http_requests_total) is registered" \
  sh -c "curl -fsS $APP_URL/metrics | grep -q '^# HELP cp_http_requests_total'"
check "request duration metric (cp_http_request_duration_seconds) is registered" \
  sh -c "curl -fsS $APP_URL/metrics | grep -q '^# HELP cp_http_request_duration_seconds'"

bold "== 4. Generating traffic (including 404, 400 and 500 errors) =="
for i in 1 2 3 4 5; do
  curl -s -o /dev/null "$APP_URL/" || true
  # 404 - non-existent endpoint
  curl -s -o /dev/null "$APP_URL/api/no-such-endpoint" || true
  # 400 - transportation request with an empty body fails Mongoose validation
  curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{}' \
    "$APP_URL/api/transportation" || true
  # 400 - same validation error, but via the warehousing endpoint
  curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{}' \
    "$APP_URL/api/warehousing" || true
  # 500 - malformed JSON body triggers an unhandled server-side error
  curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{not-json' \
    "$APP_URL/api/transportation" || true
done
echo "  … traffic sent, waiting for Prometheus scrape (2x interval)"
sleep 12

bold "== 5. Metrics in Prometheus =="
check "cp-app target is UP" \
  prom_has_result 'up{job="cp-app"} == 1'
check "node-exporter target is UP" \
  prom_has_result 'up{job="node-exporter"} == 1'
check "mongodb-exporter target is UP" \
  prom_has_result 'up{job="mongodb"} == 1'
check "HTTP request counter has samples" \
  prom_has_result 'cp_http_requests_total'
check "HTTP request duration histogram has samples" \
  prom_has_result 'cp_http_request_duration_seconds_bucket'
check "p95 latency is computable (histogram_quantile)" \
  prom_has_result 'histogram_quantile(0.95, sum by (le) (rate(cp_http_request_duration_seconds_bucket[5m])))'
check "HTTP errors (4xx/5xx) are counted" \
  prom_has_result 'sum(cp_http_requests_total{status=~"4..|5.."}) > 0'
check "HTTP 4xx errors other than 404 are counted (e.g. 400)" \
  prom_has_result 'sum(cp_http_requests_total{status=~"4[0-35-9][0-9]"}) > 0'
check "HTTP 5xx errors are counted" \
  prom_has_result 'sum(cp_http_requests_total{status=~"5.."}) > 0'
check "error growth rate (rate) is computable" \
  prom_has_result 'sum(rate(cp_http_requests_total{status=~"4..|5.."}[5m]))'

bold "== 6. Resource metrics (Node Exporter) =="
check "CPU (node_cpu_seconds_total)"        prom_has_result 'node_cpu_seconds_total'
check "RAM (node_memory_MemAvailable_bytes)" prom_has_result 'node_memory_MemAvailable_bytes'
check "disk (node_filesystem_size_bytes)"    prom_has_result 'node_filesystem_size_bytes'

bold "== 7. MongoDB metrics =="
check "mongodb-exporter exposes /metrics" curl_ok "$MONGO_EXPORTER_URL/metrics"
check "exporter is connected to Mongo (mongodb_up == 1)" \
  prom_has_result 'mongodb_up == 1'
check "opcounters are available"  prom_has_result 'mongodb_ss_opcounters'
check "connections are available" prom_has_result 'mongodb_ss_connections'

bold "== 8. Logs (Loki + Promtail) =="
# Fresh request, to make sure there is a log to collect
curl -s -o /dev/null "$APP_URL/" || true
sleep 8
NOW_NS=$(( $(date +%s) * 1000000000 ))
START_NS=$(( NOW_NS - 600 * 1000000000 ))
check "Loki has logs from the application container (cp-container)" \
  sh -c "curl -fsS -G '$LOKI_URL/loki/api/v1/query_range' \
    --data-urlencode 'query={container=\"cp-container\"}' \
    --data-urlencode 'start=$START_NS' --data-urlencode 'end=$NOW_NS' \
    --data-urlencode 'limit=5' | grep -q '\"result\":\[{'"

bold "== 9. Grafana =="
check "Grafana health OK" \
  sh -c "curl -fsS $GRAFANA_URL/api/health | grep -q '\"database\": *\"ok\"'"
check "Prometheus datasource is provisioned" \
  sh -c "curl -fsS -u $GRAFANA_AUTH $GRAFANA_URL/api/datasources/uid/prometheus | grep -q '\"type\":\"prometheus\"'"
check "Loki datasource is provisioned" \
  sh -c "curl -fsS -u $GRAFANA_AUTH $GRAFANA_URL/api/datasources/uid/loki | grep -q '\"type\":\"loki\"'"
check "dashboard 'Customer Portal - Overview' is provisioned" \
  sh -c "curl -fsS -u $GRAFANA_AUTH $GRAFANA_URL/api/dashboards/uid/cp-overview | grep -q '\"title\":\"Customer Portal - Overview\"'"

# ------------------------------------------------------------------
echo
bold "===================== SUMMARY ====================="
green "  PASS: $PASS"
if [ "$FAIL" -gt 0 ]; then
  red "  FAIL: $FAIL"
  exit 1
else
  green "  All checks green ✔"
fi
