/**
 * Logger Implementations
 *
 * Provides different logging strategies for various use cases:
 * - ConsoleLogger: Standard console output (default for SDK)
 * - InlineProgressLogger: Progress with inline replacement (for CLI)
 * - SilentLogger: No output (for quiet mode)
 */

import type { Logger } from "../../domain/ports";

/**
 * Logger options
 */
export interface LoggerOptions {
  /** Show debug messages */
  verbose?: boolean;
}

/**
 * Standard console logger.
 * Logs messages normally without inline replacement.
 * Default for SDK usage.
 */
export class ConsoleLogger implements Logger {
  private verbose: boolean;

  constructor(options?: LoggerOptions) {
    this.verbose = options?.verbose ?? false;
  }

  info(message: string): void {
    console.log(message);
  }

  warn(message: string): void {
    console.warn(message);
  }

  error(message: string): void {
    console.error(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  progress(message: string): void {
    // For SDK, just log the message normally
    console.log(message);
  }

  clearProgress(): void {
    // No-op for console logger
  }
}

/**
 * CLI logger with inline progress replacement.
 * Uses carriage return to overwrite progress lines in place.
 * Best for terminal environments with stdout/stderr.
 */
export class InlineProgressLogger implements Logger {
  private verbose: boolean;
  private lastProgressLength = 0;
  private hasProgress = false;

  constructor(options?: LoggerOptions) {
    this.verbose = options?.verbose ?? false;
  }

  info(message: string): void {
    this.clearProgress();
    console.log(message);
  }

  warn(message: string): void {
    this.clearProgress();
    console.warn(message);
  }

  error(message: string): void {
    this.clearProgress();
    console.error(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      this.clearProgress();
      console.log(message);
    }
  }

  progress(message: string): void {
    // Use carriage return to go back to beginning of line
    process.stdout.write(`\r${message}`);
    // Pad with spaces to clear any leftover characters from previous progress
    const padding = Math.max(0, this.lastProgressLength - message.length);
    if (padding > 0) {
      process.stdout.write(" ".repeat(padding));
    }
    this.lastProgressLength = message.length;
    this.hasProgress = true;
  }

  clearProgress(): void {
    if (this.hasProgress && this.lastProgressLength > 0) {
      // Clear the line completely
      process.stdout.write("\r" + " ".repeat(this.lastProgressLength) + "\r");
      this.lastProgressLength = 0;
      this.hasProgress = false;
    }
  }
}

/**
 * Silent logger that produces no output.
 * Used for quiet mode or testing.
 */
export class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
  progress(): void {}
  clearProgress(): void {}
}

/**
 * Create a standard console logger.
 * Default for SDK usage.
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}

/**
 * Create an inline progress logger for CLI usage.
 * Progress messages replace the current line.
 */
export function createInlineLogger(options?: LoggerOptions): Logger {
  return new InlineProgressLogger(options);
}

/**
 * Create a silent logger.
 * Produces no output.
 */
export function createSilentLogger(): Logger {
  return new SilentLogger();
}




