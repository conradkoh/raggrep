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

  reportProgress(completed: number, total: number, message: string): void {
    this.state = {
      completed,
      total,
      message,
      timestamp: Date.now(),
    };
  }

  private writeProgress(): void {
    const progressMessage = `  [${this.state.completed}/${this.state.total}] ${this.state.message}`;
    this.logger.progress(progressMessage);
  }
}
