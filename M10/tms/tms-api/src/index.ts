// use only for local development (outside of Docker; see .env.local file)
// require('dotenv').config();

import fs from 'fs';
import path from 'path';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import * as trpcExpress from '@trpc/server/adapters/express';
import { createHandler } from 'graphql-http/lib/use/express';

import { pool } from './database';
import { assertEnvVars } from './env';
import logger from './logger';
import routes from './router';
import { appRouter } from './trpc/router';
import { startGrpcServer } from './grpc/server.js';
import { schema } from './graphql/schema';

assertEnvVars('PORT', 'NODE_ENV', 'SERVICE_NAME', 'DATABASE_URL');

const port = process.env.PORT;

const app = express();

// Body parser MUST be first to parse request body
app.use(express.json());

// Swagger UI – dokumentacja OpenAPI pod /api-docs
const openApiPath = path.join(process.cwd(), 'contract', 'openapi.yaml');
const openApiSpec = yaml.load(fs.readFileSync(openApiPath, 'utf8')) as object;
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Mount routers
app.use(routes);

// Mount tRPC
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: () => ({}),
  })
);

// Mount GraphQL endpoint
app.all('/graphql', createHandler({ schema }));

// Last line of defence: anything a route forwarded (or threw synchronously)
// answers as a 500 instead of leaving the request hanging.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error in request pipeline', {
    error: { message: err.message, stack: err.stack },
  });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// A rejected promise outside the request pipeline must not tear the process
// down – Node's default policy would exit(1) and take every in-flight request
// with it.
process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled promise rejection', {
    error: { message: error.message, stack: error.stack },
  });
});

// Start gRPC server
startGrpcServer();

// Start the server
app.listen(port, () => {
  const formattedTime = new Date().toISOString();
  logger.info(`Server started on port ${port} at ${formattedTime}`, {
    port: Number(port),
    env: process.env.NODE_ENV,
    service: process.env.SERVICE_NAME,
    timestamp: formattedTime,
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Graceful shutdown initiated', { signal: 'SIGTERM' });

  try {
    await pool.end();
    logger.info('Database connection pool closed successfully');
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Failed to close database connection pool', {
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
  }

  logger.info('HTTP server closed');
  process.exit(0);
});
