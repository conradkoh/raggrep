/**
 * Progress Manager - Thread-safe progress reporting for parallel operations
 *
 * Handles concurrent progress updates from multiple workers and batches
 * them to avoid race conditions and flickering output.
 */

import type { Logger } from "../../domain/ports";

interface ProgressState {
  completed: number;
  total: number;
  message: string;
  timestamp: number;
  /** Number of newly indexed files */
  indexed?: number;
  /** Number of skipped files (unchanged) */
  skipped?: number;
}

const PROGRESS_UPDATE_INTERVAL_MS = 50;

export class ProgressManager {
  private logger: Logger;
  private state: ProgressState = {
    completed: 0,
    total: 0,
    message: "",
    timestamp: 0,
  };
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.writeProgress();
    }, PROGRESS_UPDATE_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger.clearProgress();
  }

  reportProgress(completed: number, total: number, message: string, indexed?: number, skipped?: number): void {
    this.state = {
      completed,
      total,
      message,
      indexed,
      skipped,
      timestamp: Date.now(),
    };
  }

  private writeProgress(): void {
    let progressMessage = `  [${this.state.completed}/${this.state.total}] ${this.state.message}`;

    // Add additional stats if provided
    if (this.state.indexed !== undefined || this.state.skipped !== undefined) {
      const parts: string[] = [];
      if (this.state.indexed !== undefined && this.state.indexed > 0) {
        parts.push(`${this.state.indexed} indexed`);
      }
      if (this.state.skipped !== undefined && this.state.skipped > 0) {
        parts.push(`${this.state.skipped} skipped`);
      }
      if (parts.length > 0) {
        progressMessage += ` (${parts.join(', ')})`;
      }
    }

    this.logger.progress(progressMessage);
  }
}
