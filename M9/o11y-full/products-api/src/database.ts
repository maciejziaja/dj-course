// database.ts
import { Pool } from 'pg';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

// Parse DATABASE_URL to extract connection parameters
// This is required for proper OpenTelemetry instrumentation to set db_client_connection_pool_name
const parseConnectionString = (url: string) => {
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };
};

const dbConfig = parseConnectionString(process.env.DATABASE_URL!);

const pool = new Pool({
  ...dbConfig,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  // Without this, pg waits FOREVER for a free connection. An exhausted pool then looks
  // like a hung request rather than a failure: the client eventually times out, but the
  // server never produces a status code, so the outage is invisible in metrics.
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 2000),
});

// Initialize a tracer for database operations
const tracer = trace.getTracer('database');

// Largest page a caller may ask for. An unbounded `SELECT *` grows with the table, so a
// single request eventually returns megabytes: the response time stops depending on the
// server's health and starts depending on how much data has accumulated.
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

// Function to get a page of products
const getProducts = async (limit: number = DEFAULT_PAGE_SIZE) => {
  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  // Start a span for this database call
  const span = tracer.startSpan('getProducts', {
    attributes: {
      'db.system': 'postgresql',
      'db.statement': 'SELECT * FROM products ORDER BY product_id LIMIT $1',
      'db.page_size': pageSize,
    },
  });
  try {
    // Run the query within the span's context
    const { rows } = await context.with(trace.setSpan(context.active(), span), () =>
      pool.query('SELECT * FROM products ORDER BY product_id LIMIT $1', [pageSize])
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return rows;
  } catch (error: any) {
    // Record exception and mark the span as errored
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    console.error('Error fetching products:', error);
    throw error;
  } finally {
    // End the span
    span.end();
  }
};

const getProductById = async (id: string) => {
  const span = tracer.startSpan('getProductById', {
    attributes: {
      'db.system': 'postgresql',
      'db.statement': 'SELECT * FROM products WHERE product_id = $1',
    },
  });
  try {
    const { rows } = await context.with(trace.setSpan(context.active(), span), () =>
      pool.query('SELECT * FROM products WHERE product_id = $1', [id])
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return rows[0];
  } catch (error: any) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    console.error('Error fetching product by id:', error);
    throw error;
  } finally {
    span.end();
  }
};

export {
  pool,
  getProducts,
  getProductById,
};
