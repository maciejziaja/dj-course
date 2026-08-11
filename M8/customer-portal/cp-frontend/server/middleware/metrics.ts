import { Counter, Histogram, register } from 'prom-client'

// Guard przeciw podwójnej rejestracji przy HMR w dev mode
function getOrCreateCounter(name: string, help: string, labelNames: string[]) {
  return (register.getSingleMetric(name) as Counter<string>)
    ?? new Counter({ name, help, labelNames })
}

function getOrCreateHistogram(name: string, help: string, labelNames: string[]) {
  return (register.getSingleMetric(name) as Histogram<string>)
    ?? new Histogram({
      name,
      help,
      labelNames,
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    })
}

const httpRequestsTotal = getOrCreateCounter(
  'cp_http_requests_total',
  'Total number of HTTP requests',
  ['method', 'route', 'status'],
)

const httpRequestDuration = getOrCreateHistogram(
  'cp_http_request_duration_seconds',
  'HTTP request duration in seconds',
  ['method', 'route', 'status'],
)

// Normalizacja ścieżki, żeby nie eksplodować kardynalnością labeli
// (/api/storage/665f... -> /api/storage/:id)
function normalizeRoute(path: string): string {
  return path
    .split('?')[0]
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id') // ObjectId
    .replace(/\/\d+(?=\/|$)/g, '/:id')           // liczby
}

const IGNORED_PREFIXES = ['/metrics', '/health', '/_nuxt', '/__nuxt', '/favicon']

export default defineEventHandler((event) => {
  const path = event.path ?? ''
  if (IGNORED_PREFIXES.some(p => path.startsWith(p))) return

  const start = process.hrtime.bigint()
  const method = event.method
  const route = normalizeRoute(path)

  event.node.res.on('finish', () => {
    const statusCode = event.node.res.statusCode
    const status = String(statusCode)
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9

    // METRYKI
    httpRequestsTotal.inc({ method, route, status })
    httpRequestDuration.observe({ method, route, status }, durationSeconds)

    // LOGI - JSON prosto na stdout (12-factor), skąd zbiera je Promtail
    // przez docker_sd_configs.
    // Level zależny od statusu odpowiedzi (5xx=error, 4xx=warn),
    // żeby dashboardy mogły filtrować błędy po level.
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

    console.log(JSON.stringify({
      level,
      time: new Date().toISOString(),
      msg: `${method} ${path} ${status}`,
      method,
      route,
      status,
      duration_ms: Math.round(durationSeconds * 1000),
    }))
  })
})
