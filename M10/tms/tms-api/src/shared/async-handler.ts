import type { NextFunction, Request, RequestHandler, Response } from 'express';

import logger from '../logger';

/**
 * Wraps an async route handler so a rejected promise becomes a 500 response
 * instead of an unhandled rejection.
 *
 * Express 4 does not await handlers, so a promise that rejects is never passed
 * to the error middleware – under Node's default policy it tears the whole
 * process down. Domain and validation failures are expected to be returned as
 * values; anything that reaches here is a genuine bug or an infrastructure
 * failure (a DB row the catalog cannot map, a lost connection), so it is logged
 * with its stack and answered generically.
 */
export function asyncHandler<Req extends Request, Res extends Response>(
  context: string,
  handler: (req: Req, res: Res, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req as unknown as Req, res as unknown as Res, next).catch((error: unknown) => {
      const err = error as Error;
      logger.error(context, {
        error: { message: err.message, stack: err.stack },
        method: req.method,
        path: req.originalUrl,
      });
      if (res.headersSent) return;
      res.status(500).json({ error: context });
    });
  };
}
