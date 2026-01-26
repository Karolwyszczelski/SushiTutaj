// src/lib/logger.ts
import winston from "winston";

const isServer = typeof window === "undefined";
const isDev = process.env.NODE_ENV === "development";

// Custom format for better readability in dev
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// JSON format for production (better for log aggregation)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger only on server
const logger = isServer
  ? winston.createLogger({
      level: isDev ? "debug" : "info",
      format: isDev ? devFormat : prodFormat,
      transports: [new winston.transports.Console()],
      // Don't exit on uncaught exceptions - let Next.js handle it
      exitOnError: false,
    })
  : // Client-side fallback (should never be used, but just in case)
    ({
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
      log: console.log,
    } as unknown as winston.Logger);

export default logger;

// Convenience exports with context
export const createLogger = (context: string) => ({
  error: (message: string, meta?: Record<string, unknown>) =>
    logger.error(message, { context, ...meta }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    logger.warn(message, { context, ...meta }),
  info: (message: string, meta?: Record<string, unknown>) =>
    logger.info(message, { context, ...meta }),
  debug: (message: string, meta?: Record<string, unknown>) =>
    logger.debug(message, { context, ...meta }),
});

// Pre-defined loggers for common contexts
export const apiLogger = createLogger("api");
export const authLogger = createLogger("auth");
export const orderLogger = createLogger("orders");
export const pushLogger = createLogger("push");
