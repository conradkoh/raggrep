/**
 * Multi-Module Progress Manager - Consolidated progress for parallel module indexing
 *
 * Tracks progress across multiple modules and displays them on a single line.
 * Thread-safe progress updates from concurrent workers.
 */

import type { Logger } from "../../domain/ports";

interface ModuleProgress {
  moduleName: string;
  completed: number;
  total: number;
  currentFile: string;
  active: boolean;
}

const PROGRESS_UPDATE_INTERVAL_MS = 50;

export class MultiModuleProgressManager {
  private logger: Logger;
  private modules: Map<string, ModuleProgress> = new Map();
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

  registerModule(moduleId: string, moduleName: string, totalFiles: number): void {
    this.modules.set(moduleId, {
      moduleName,
      completed: 0,
      total: totalFiles,
      currentFile: "",
      active: true,
    });
  }

  unregisterModule(moduleId: string): void {
    const module = this.modules.get(moduleId);
    if (module) {
      module.active = false;
    }
  }

  reportProgress(moduleId: string, completed: number, currentFile: string): void {
    const module = this.modules.get(moduleId);
    if (!module) {
      return;
    }

    module.completed = completed;
    module.currentFile = currentFile;
  }

  private writeProgress(): void {
    const activeModules = Array.from(this.modules.values()).filter(m => m.active);

    if (activeModules.length === 0) {
      return;
    }

    if (activeModules.length === 1) {
      const m = activeModules[0];
      const progressMessage = `[${m.moduleName}] ${m.completed}/${m.total}: ${m.currentFile}`;
      this.logger.progress(progressMessage);
    } else {
      const parts = activeModules.map(m => {
        const percent = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 100;
        return `[${m.moduleName} ${m.completed}/${m.total} ${percent}%]`;
      });
      const progressMessage = parts.join(" ");
      this.logger.progress(progressMessage);
    }
  }
}
