/**
 * Logger Port
 *
 * Abstract interface for logging progress and messages.
 * This allows the domain and application layers to remain independent
 * of the actual logging implementation (console, file, etc.).
 */

/**
 * Progress information for long-running operations
 */
export interface ProgressInfo {
  /** Current item being processed */
  current: number;
  /** Total number of items */
  total: number;
  /** Optional descriptive message */
  message?: string;
}

/**
 * Abstract logger interface.
 *
 * Implementations might:
 * - Log to console (ConsoleLogger)
 * - Log to console with inline replacement for progress (InlineProgressLogger)
 * - Be silent (SilentLogger)
 * - Log to a file or external service
 */
export interface Logger {
  /**
   * Log an info message (general progress updates)
   */
  info(message: string): void;

  /**
   * Log a warning message
   */
  warn(message: string): void;

  /**
   * Log an error message
   */
  error(message: string): void;

  /**
   * Log a debug message (only shown in verbose mode)
   */
  debug(message: string): void;

  /**
   * Log a progress update that can replace the current line.
   * Used for download progress, file processing counters, etc.
   *
   * In terminal environments, this may overwrite the current line.
   * In non-terminal environments (SDK), this may just log normally.
   *
   * @param message - Progress message to display
   */
  progress(message: string): void;

  /**
   * Clear any inline progress output.
   * Call this before switching from progress() to info/warn/error.
   */
  clearProgress(): void;
}

/**
 * Factory function type for creating loggers
 */
export type LoggerFactory = (options?: { verbose?: boolean }) => Logger;
