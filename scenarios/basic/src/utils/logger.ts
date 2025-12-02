/**
 * Logging Utility
 *
 * Structured logging with different levels and formatters.
 * Supports JSON output for production and pretty printing for development.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface LoggerConfig {
  level: LogLevel;
  format: "json" | "pretty";
  includeTimestamp: boolean;
}

const defaultConfig: LoggerConfig = {
  level: LogLevel.INFO,
  format: process.env.NODE_ENV === "production" ? "json" : "pretty",
  includeTimestamp: true,
};

let config = { ...defaultConfig };

/**
 * Configure the logger
 */
export function configureLogger(options: Partial<LoggerConfig>): void {
  config = { ...config, ...options };
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel[level],
    message,
  };

  if (context) {
    entry.context = context;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return entry;
}

/**
 * Format and output a log entry
 */
function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): void {
  if (level < config.level) {
    return;
  }

  const entry = createLogEntry(level, message, context, error);

  if (config.format === "json") {
    console.log(JSON.stringify(entry));
  } else {
    const timestamp = config.includeTimestamp ? `[${entry.timestamp}] ` : "";
    const levelStr = entry.level.padEnd(5);
    let output = `${timestamp}${levelStr} ${message}`;

    if (context) {
      output += ` ${JSON.stringify(context)}`;
    }

    if (error) {
      output += `\n  Error: ${error.message}`;
      if (error.stack) {
        output += `\n  ${error.stack}`;
      }
    }

    console.log(output);
  }
}

/**
 * Log a debug message
 */
export function debug(
  message: string,
  context?: Record<string, unknown>
): void {
  log(LogLevel.DEBUG, message, context);
}

/**
 * Log an info message
 */
export function info(message: string, context?: Record<string, unknown>): void {
  log(LogLevel.INFO, message, context);
}

/**
 * Log a warning message
 */
export function warn(message: string, context?: Record<string, unknown>): void {
  log(LogLevel.WARN, message, context);
}

/**
 * Log an error message
 */
export function error(
  message: string,
  errorOrContext?: Error | Record<string, unknown>,
  context?: Record<string, unknown>
): void {
  if (errorOrContext instanceof Error) {
    log(LogLevel.ERROR, message, context, errorOrContext);
  } else {
    log(LogLevel.ERROR, message, errorOrContext);
  }
}

/**
 * Create a child logger with preset context
 */
export function createLogger(baseContext: Record<string, unknown>) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) =>
      debug(msg, { ...baseContext, ...ctx }),
    info: (msg: string, ctx?: Record<string, unknown>) =>
      info(msg, { ...baseContext, ...ctx }),
    warn: (msg: string, ctx?: Record<string, unknown>) =>
      warn(msg, { ...baseContext, ...ctx }),
    error: (
      msg: string,
      err?: Error | Record<string, unknown>,
      ctx?: Record<string, unknown>
    ) => error(msg, err, { ...baseContext, ...ctx }),
  };
}
