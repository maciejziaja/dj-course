/**
 * Logger utility for server-side logging
 *
 * Emituje strukturalne logi JSON na stdout/stderr (12-factor),
 * skąd zbiera je Promtail (pipeline parsuje pola level/msg).
 * Format spójny z server/middleware/metrics.ts.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function emit(level: LogLevel, message: string, meta?: Record<string, any>) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    ...meta,
  })
  // Piszemy bezpośrednio do stdout/stderr - Nuxt (consola) przechwytuje
  // console.warn/error i dokleja prefiksy (np. "WARN "), co psułoby JSON.
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    emit('info', message, meta)
  },

  error: (message: string, error?: Error | any, meta?: Record<string, any>) => {
    emit('error', message, {
      error: error?.message || error,
      stack: error?.stack,
      ...meta,
    })
  },

  warn: (message: string, meta?: Record<string, any>) => {
    emit('warn', message, meta)
  },

  debug: (message: string, meta?: Record<string, any>) => {
    // Debug tylko w development
    if (process.env.NODE_ENV === 'development') {
      emit('debug', message, meta)
    }
  }
}

/**
 * Create a scoped logger with a prefix
 */
export function createScopedLogger(scope: string) {
  return {
    info: (message: string, meta?: Record<string, any>) => {
      logger.info(message, { scope, ...meta })
    },
    error: (message: string, error?: Error | any, meta?: Record<string, any>) => {
      logger.error(message, error, { scope, ...meta })
    },
    warn: (message: string, meta?: Record<string, any>) => {
      logger.warn(message, { scope, ...meta })
    },
    debug: (message: string, meta?: Record<string, any>) => {
      logger.debug(message, { scope, ...meta })
    }
  }
}
