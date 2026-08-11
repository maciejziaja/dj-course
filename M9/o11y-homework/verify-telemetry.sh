#!/bin/bash

# Telemetry verification script for o11y-homework
# Generates synthetic traffic (metrics, logs, traces) and verifies each hop
# of the pipeline: products-api -> otel-collector -> Prometheus/Loki/Tempo -> Grafana

set -uo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_URL="http://localhost:3000"
PROM_URL="http://localhost:9090"
LOKI_URL="http://localhost:3100"
TEMPO_URL="http://localhost:3200"
GRAFANA_URL="http://localhost:4000"
GRAFANA_AUTH="admin:secret"
COLLECTOR_EXPORTER_URL="http://localhost:8891/metrics"

PASS=0
FAIL=0

ok()   { echo -e "   ${GREEN}✓ $1${NC}"; PASS=$((PASS+1)); }
bad()  { echo -e "   ${RED}✗ $1${NC}"; FAIL=$((FAIL+1)); }
warn() { echo -e "   ${YELLOW}⚠️  $1${NC}"; }

prom_query() {
  curl -s -G "$PROM_URL/api/v1/query" --data-urlencode "query=$1" | \
    jq -r '.data.result[0].value[1] // "none"'
}

echo "🧪 o11y-homework — Telemetry Verification"
echo "=========================================="
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "0️⃣  Container / endpoint availability"
echo "=========================================="

if curl -sf "$API_URL/health" > /dev/null; then
  ok "products-api is up ($API_URL/health)"
else
  bad "products-api is NOT responding at $API_URL/health"
  echo -e "   ${YELLOW}Run: docker compose up -d (in o11y-homework)${NC}"
  exit 1
fi

curl -sf "$PROM_URL/-/ready" > /dev/null && ok "Prometheus is ready ($PROM_URL)" || bad "Prometheus not ready at $PROM_URL"
curl -sf "$LOKI_URL/ready" > /dev/null && ok "Loki is ready ($LOKI_URL)" || bad "Loki not ready at $LOKI_URL"
curl -sf "$TEMPO_URL/ready" > /dev/null && ok "Tempo is ready ($TEMPO_URL)" || bad "Tempo not ready at $TEMPO_URL"
curl -sf "$GRAFANA_URL/api/health" > /dev/null && ok "Grafana is up ($GRAFANA_URL)" || bad "Grafana not responding at $GRAFANA_URL"
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "🚀 Generating synthetic traffic"
echo "=========================================="

echo -e "${BLUE}1. GET /products (success traffic)${NC}"
for i in {1..10}; do curl -s "$API_URL/products" > /dev/null; echo -n "."; done; echo " ✓"

echo -e "${BLUE}2. GET /products/:id${NC}"
for i in {1..5}; do curl -s "$API_URL/products/$i" > /dev/null; echo -n "."; done; echo " ✓"

echo -e "${BLUE}3. GET /top/products-by-category/:id + /top/customers-by-total-spent + /orders/delivered${NC}"
for i in {1..3}; do
  curl -s "$API_URL/top/products-by-category/$i" > /dev/null
  curl -s "$API_URL/top/customers-by-total-spent?limit=10" > /dev/null
  curl -s "$API_URL/orders/delivered" > /dev/null
  echo -n "."
done; echo " ✓"

echo -e "${BLUE}4. GET /error + /inject-error (error traffic → error logs & error metrics)${NC}"
for i in {1..5}; do
  curl -s "$API_URL/error" > /dev/null
  curl -s "$API_URL/inject-error" > /dev/null
  echo -n "."
done; echo " ✓"

echo -e "${BLUE}5. GET /inject-leak (child spans / events)${NC}"
for i in {1..2}; do curl -s "$API_URL/inject-leak" > /dev/null; echo -n "."; done; echo " ✓"

echo -e "${BLUE}6. GET /health (health metric)${NC}"
for i in {1..3}; do curl -s "$API_URL/health" > /dev/null; echo -n "."; done; echo " ✓"

echo -e "${BLUE}7. POST /client_metrics (web vitals)${NC}"
for i in {1..3}; do
  curl -s -X POST "$API_URL/client_metrics" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"LCP\", \"value\": $((2000 + RANDOM % 1000)), \"page_path\": \"/test-$i\", \"device_type\": \"desktop\", \"connection_type\": \"wifi\"}" > /dev/null
  echo -n "."
done; echo " ✓"

echo -e "${BLUE}8. GET /nonexistent (404 traffic)${NC}"
for i in {1..3}; do curl -s "$API_URL/nonexistent-$i" > /dev/null; echo -n "."; done; echo " ✓"
echo ""

echo -e "${YELLOW}⏳ Waiting 20 seconds for export + Prometheus scrape...${NC}"
sleep 20
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "1️⃣  OTel Collector (Prometheus exporter endpoint)"
echo "=========================================="

COLLECTOR_METRICS=$(curl -s "$COLLECTOR_EXPORTER_URL" || true)
if [ -z "$COLLECTOR_METRICS" ]; then
  bad "Collector exporter endpoint returns nothing ($COLLECTOR_EXPORTER_URL)"
else
  # Note: use grep <<< instead of `echo | grep -q` — with `set -o pipefail`,
  # grep -q exiting early gives echo a SIGPIPE and falsely fails the check.
  grep -q 'http_server_duration' <<< "$COLLECTOR_METRICS" \
    && ok "Collector exposes http_server_duration_* metrics" \
    || bad "Collector does NOT expose http_server_duration_* (app→collector metrics flow broken?)"
  grep -q 'health_status' <<< "$COLLECTOR_METRICS" \
    && ok "Collector exposes health_status metric" \
    || warn "No health_status metric on collector exporter"
fi
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "2️⃣  METRICS in Prometheus"
echo "=========================================="

HTTP_COUNT=$(prom_query 'sum(http_server_duration_milliseconds_count)')
[ "$HTTP_COUNT" != "none" ] && ok "http_server_duration_milliseconds_count present (total: $HTTP_COUNT)" \
  || bad "No http_server_duration_milliseconds_count in Prometheus (collector→prometheus flow broken?)"

P95=$(prom_query 'histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))')
[ "$P95" != "none" ] && [ "$P95" != "NaN" ] && ok "p95 latency computable: ${P95}ms" \
  || bad "Cannot compute p95 from http_server_duration_milliseconds_bucket"

ERR_RATE=$(prom_query 'sum(rate(http_server_duration_milliseconds_count{http_status_code=~"[45].."}[5m]))')
[ "$ERR_RATE" != "none" ] && ok "Error-rate metric present (4xx/5xx rate: $ERR_RATE)" \
  || bad "No 4xx/5xx labeled samples found"

HEALTH=$(prom_query 'health_status_ratio')
[ "$HEALTH" != "none" ] && ok "health_status_ratio = $HEALTH" || bad "No health_status_ratio metric"

DB_CONN=$(prom_query 'sum(db_client_connection_count)')
[ "$DB_CONN" != "none" ] && ok "db_client_connection_count = $DB_CONN" || warn "No db_client_connection_count metric"

PG=$(prom_query "pg_stat_activity_count{datname='products'}")
[ "$PG" != "none" ] && ok "postgres-exporter: pg_stat_activity_count = $PG" || bad "No pg_stat_activity_count (postgres-exporter scrape broken?)"

NODE=$(prom_query 'node_load1')
[ "$NODE" != "none" ] && ok "node-exporter: node_load1 = $NODE" || warn "No node-exporter metrics (node_load1)"

echo ""
echo "   Relevant metric names in Prometheus:"
curl -s "$PROM_URL/api/v1/label/__name__/values" | \
  jq -r '.data[] | select(test("^(http_|db_|web_vitals|health_)"))' | head -15 | sed 's/^/      - /'
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "3️⃣  LOGS in Loki"
echo "=========================================="

SERVICES=$(curl -s "$LOKI_URL/loki/api/v1/label/service_name/values" | jq -r '.data[]?' 2>/dev/null)
if echo "$SERVICES" | grep -q 'products-api'; then
  ok "Loki has service_name=products-api stream"
else
  bad "Loki has no products-api logs (collector→loki flow broken?). Services found: ${SERVICES:-<none>}"
fi

NOW_NS=$(($(date +%s) * 1000000000))
START_NS=$((NOW_NS - 3600000000000))
LOG_COUNT=$(curl -s -G "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode 'query={service_name="products-api"}' \
  --data-urlencode "start=$START_NS" --data-urlencode "end=$NOW_NS" \
  --data-urlencode 'limit=100' | jq -r '[.data.result[].values | length] | add // 0' 2>/dev/null)
[ "${LOG_COUNT:-0}" -gt 0 ] && ok "Found $LOG_COUNT log line(s) in the last hour" || bad "No log lines found in Loki (last hour)"

ERR_LOGS=$(curl -s -G "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode 'query={service_name="products-api"} |= `error`' \
  --data-urlencode "start=$START_NS" --data-urlencode "end=$NOW_NS" \
  --data-urlencode 'limit=100' | jq -r '[.data.result[].values | length] | add // 0' 2>/dev/null)
[ "${ERR_LOGS:-0}" -gt 0 ] && ok "Found $ERR_LOGS error log line(s)" || warn "No error log lines matched"
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "4️⃣  TRACES in Tempo"
echo "=========================================="

NOW_S=$(date +%s)
TRACES=$(curl -s -G "$TEMPO_URL/api/search" \
  --data-urlencode 'q={resource.service.name="products-api"}' \
  --data-urlencode "start=$((NOW_S - 3600))" --data-urlencode "end=$NOW_S" \
  --data-urlencode 'limit=5' | jq -r '.traces | length' 2>/dev/null)
if [ "${TRACES:-0}" -gt 0 ]; then
  ok "Tempo search returned $TRACES trace(s) for products-api"
  TRACE_ID=$(curl -s -G "$TEMPO_URL/api/search" \
    --data-urlencode 'q={resource.service.name="products-api"}' \
    --data-urlencode "start=$((NOW_S - 3600))" --data-urlencode "end=$NOW_S" \
    --data-urlencode 'limit=1' | jq -r '.traces[0].traceID')
  echo "   Sample trace ID: $TRACE_ID"
else
  bad "No traces in Tempo for products-api (collector→tempo flow broken?)"
fi
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "5️⃣  GRAFANA datasources & dashboard"
echo "=========================================="

DS_JSON=$(curl -s -u "$GRAFANA_AUTH" "$GRAFANA_URL/api/datasources")
for ds_type in prometheus loki tempo; do
  DS_UID=$(echo "$DS_JSON" | jq -r ".[] | select(.type==\"$ds_type\") | .uid" | head -1)
  if [ -n "$DS_UID" ] && [ "$DS_UID" != "null" ]; then
    HEALTH_JSON=$(curl -s -u "$GRAFANA_AUTH" "$GRAFANA_URL/api/datasources/uid/$DS_UID/health")
    HEALTH_STATUS=$(jq -r '.status // "unknown"' <<< "$HEALTH_JSON")
    if [ "$HEALTH_STATUS" = "OK" ]; then
      ok "Grafana datasource '$ds_type' (uid=$DS_UID) health: OK"
    elif jq -e '.messageId == "plugin.notImplemented"' <<< "$HEALTH_JSON" > /dev/null 2>&1; then
      # Some plugins (e.g. tempo in Grafana 12) don't implement the health API;
      # fall back to reaching the datasource through the Grafana proxy.
      if curl -sf -u "$GRAFANA_AUTH" "$GRAFANA_URL/api/datasources/proxy/uid/$DS_UID/api/echo" > /dev/null 2>&1 || \
         curl -sf -u "$GRAFANA_AUTH" "$GRAFANA_URL/api/datasources/proxy/uid/$DS_UID/api/status/buildinfo" > /dev/null 2>&1; then
        ok "Grafana datasource '$ds_type' (uid=$DS_UID) reachable via proxy (health API not implemented by plugin)"
      else
        bad "Grafana datasource '$ds_type' (uid=$DS_UID) NOT reachable via proxy"
      fi
    else
      bad "Grafana datasource '$ds_type' (uid=$DS_UID) health: $HEALTH_STATUS"
    fi
  else
    bad "Grafana has NO '$ds_type' datasource provisioned"
  fi
done

DASH=$(curl -s -u "$GRAFANA_AUTH" "$GRAFANA_URL/api/search?query=Metrics" | jq -r '.[] | select(.title | test("Metrics"; "i")) | .uid' | head -1)
if [ -n "$DASH" ] && [ "$DASH" != "null" ]; then
  ok "Found '(OTLP) Metrics' dashboard (uid=$DASH)"
  # Verify via Grafana proxy that a core dashboard query returns data
  PROM_UID=$(echo "$DS_JSON" | jq -r '.[] | select(.type=="prometheus") | .uid' | head -1)
  if [ -n "$PROM_UID" ] && [ "$PROM_UID" != "null" ]; then
    GF_RESULT=$(curl -s -u "$GRAFANA_AUTH" -G \
      "$GRAFANA_URL/api/datasources/proxy/uid/$PROM_UID/api/v1/query" \
      --data-urlencode 'query=sum(http_server_duration_milliseconds_count)' | \
      jq -r '.data.result[0].value[1] // "none"')
    [ "$GF_RESULT" != "none" ] && ok "Grafana→Prometheus proxy query works (value: $GF_RESULT)" \
      || bad "Grafana→Prometheus proxy query returned no data (grafana→prometheus flow broken?)"
  fi
else
  bad "No '(OTLP) Metrics' dashboard found in Grafana"
fi
echo ""

# ------------------------------------------------------------------
echo "=========================================="
echo "6️⃣  DASHBOARD WIDGETS — every panel must show data"
echo "=========================================="
echo "   (GOAL: wszystkie widgety w '(OTLP) Metrics Dashboard' pokazują dane)"
echo ""

DASHBOARD_JSON="$(cd "$(dirname "$0")" && pwd)/grafana/provisioning/dashboards/otlp-metrics-dashboard.json"
PROM_UID=$(echo "$DS_JSON" | jq -r '.[] | select(.type=="prometheus") | .uid' | head -1)

if [ ! -f "$DASHBOARD_JSON" ]; then
  bad "Dashboard JSON not found at $DASHBOARD_JSON"
elif [ -z "$PROM_UID" ] || [ "$PROM_UID" = "null" ]; then
  bad "Cannot check widgets: no prometheus datasource in Grafana"
else
  # Iterate over all non-row panels; each target expr is checked separately.
  # Emit: base64(expr) TAB panel-title
  while IFS=$'\t' read -r EXPR_B64 PANEL_TITLE; do
    EXPR=$(echo "$EXPR_B64" | base64 -d)
    # Substitute dashboard template variables the way Grafana would
    # ($route/$method → All='.*', $__range → 15m)
    QUERY=$(echo "$EXPR" | sed -e 's/\$route/.*/g' -e 's/\$method/.*/g' -e 's/\$__range/15m/g')
    RESULT=$(curl -s -u "$GRAFANA_AUTH" -G \
      "$GRAFANA_URL/api/datasources/proxy/uid/$PROM_UID/api/v1/query" \
      --data-urlencode "query=$QUERY")
    STATUS=$(echo "$RESULT" | jq -r '.status // "error"')
    COUNT=$(echo "$RESULT" | jq -r '.data.result | length' 2>/dev/null || echo 0)
    VALUE=$(echo "$RESULT" | jq -r '.data.result[0].value[1] // empty' 2>/dev/null)
    if [ "$STATUS" != "success" ]; then
      ERR_MSG=$(echo "$RESULT" | jq -r '.error // "unknown error"' 2>/dev/null)
      bad "Widget '$PANEL_TITLE': query error → $ERR_MSG"
      echo "      query: $QUERY"
    elif [ "${COUNT:-0}" -eq 0 ] || [ -z "$VALUE" ] || [ "$VALUE" = "NaN" ]; then
      bad "Widget '$PANEL_TITLE': NO DATA"
      echo "      query: $QUERY"
    else
      ok "Widget '$PANEL_TITLE': has data ($COUNT serie(s), sample value: $VALUE)"
    fi
  done < <(jq -r '
      .panels[]
      | select(.type != "row")
      | .title as $t
      | .targets[]?
      | select(.expr != null and .expr != "")
      | [(.expr | @base64), $t] | @tsv
    ' "$DASHBOARD_JSON")
fi
echo ""

# ------------------------------------------------------------------
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}✅ ALL CHECKS PASSED ($PASS passed)${NC}"
else
  echo -e "${RED}❌ $FAIL CHECK(S) FAILED${NC} (${GREEN}$PASS passed${NC})"
  echo ""
  echo "Debugging hints (check flow hop-by-hop):"
  echo "  - App not sending?        docker compose logs products-api | tail -50"
  echo "  - Collector not receiving? docker compose logs otel-collector | tail -50"
  echo "  - Prometheus not scraping? $PROM_URL/targets"
  echo "  - Grafana can't reach data? $GRAFANA_URL/connections/datasources"
fi
echo "=========================================="
echo ""
echo "🔗 Useful URLs:"
echo "   Grafana:            $GRAFANA_URL (admin/secret)"
echo "   Metrics dashboard:  $GRAFANA_URL/dashboards (→ (OTLP) Metrics Dashboard)"
echo "   Prometheus targets: $PROM_URL/targets"
echo "   Collector exporter: $COLLECTOR_EXPORTER_URL"
echo ""

exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
