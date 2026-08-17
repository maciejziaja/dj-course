import { Request, Response, NextFunction } from 'express';
import logger from './logger';

// Load shedding: cap how many requests are processed at once and reject the rest with 503.
//
// This is what turns an overload into something the dashboards can show. Without a cap the
// server keeps accepting work it cannot finish, the client gives up first, and the server's
// own telemetry reports a quiet, healthy service. Rejecting is cheap, so a capacity problem
// surfaces as a rate of 503s instead of as silence.
const MAX_CONCURRENT_REQUESTS = Number(process.env.MAX_CONCURRENT_REQUESTS ?? 50);

let inFlightRequests = 0;

/**
 * Tracks how many requests are currently being processed. Mount globally, before routing.
 */
export function trackInFlight(req: Request, res: Response, next: NextFunction): void {
  inFlightRequests++;
  res.on('close', () => { inFlightRequests--; });
  next();
}

/**
 * Rejects the request with 503 when the server is already at capacity.
 *
 * Mount this per route, NOT globally. The HTTP instrumentation derives the `http.route`
 * metric attribute from the route Express matched, and it ignores attributes set on the
 * span afterwards. A guard that rejects before routing therefore produces 503 samples with
 * no `http_route` label - and every dashboard panel filters on that label, so the errors
 * would be recorded and still invisible.
 */
export function shedIfOverloaded(req: Request, res: Response, next: NextFunction): void {
  if (inFlightRequests <= MAX_CONCURRENT_REQUESTS) return next();

  logger.warn('Request shed - server at capacity', {
    http: { method: req.method, url: req.originalUrl },
    in_flight: inFlightRequests,
    limit: MAX_CONCURRENT_REQUESTS,
  });
  res.status(503).json({ error: 'Service Unavailable', reason: 'server at capacity' });
}
