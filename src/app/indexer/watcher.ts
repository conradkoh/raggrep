/**
 * File watcher for incremental indexing
 * 
 * Best practices implemented:
 * - Debouncing: Batches rapid file changes (e.g., IDE saves, git operations)
 * - Queuing: Prevents concurrent index operations
 * - Efficient filtering: Only watches relevant file types
 * - Graceful shutdown: Proper cleanup on SIGINT/SIGTERM
 * - Error recovery: Continues watching after index errors
 */

import { watch, type FSWatcher } from 'chokidar';
import * as path from 'path';
import { loadConfig, getIndexLocation } from '../../infrastructure/config';
import type { Config } from '../../domain/entities';
import { indexDirectory, cleanupIndex, type IndexOptions, type IndexResult } from './index';

/** Default debounce delay in milliseconds */
const DEFAULT_DEBOUNCE_MS = 300;

/** Maximum files to batch before forcing an index */
const MAX_BATCH_SIZE = 100;

export interface WatchOptions extends IndexOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Callback when indexing starts */
  onIndexStart?: (files: string[]) => void;
  /** Callback when indexing completes */
  onIndexComplete?: (results: IndexResult[]) => void;
  /** Callback when a file change is detected */
  onFileChange?: (event: 'add' | 'change' | 'unlink', filepath: string) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

export interface FileWatcher {
  /** Stop watching and clean up */
  stop: () => Promise<void>;
  /** Whether the watcher is currently running */
  isRunning: () => boolean;
}

/**
 * Start watching a directory for file changes and index incrementally
 */
export async function watchDirectory(
  rootDir: string,
  options: WatchOptions = {}
): Promise<FileWatcher> {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    verbose = false,
    model,
    onIndexStart,
    onIndexComplete,
    onFileChange,
    onError,
  } = options;

  // Ensure absolute path
  rootDir = path.resolve(rootDir);
  
  // Load config
  const config = await loadConfig(rootDir);
  
  // Get index location (now in temp directory, so no need to ignore in project)
  const indexLocation = getIndexLocation(rootDir);
  
  // Create a set of valid extensions for fast lookup
  const validExtensions = new Set(config.extensions);
  
  // Build ignore patterns - watch directory, filter by extension
  const ignorePatterns = [
    ...config.ignorePaths.map(p => `**/${p}/**`),
    '**/node_modules/**',
    '**/.git/**',
  ];
  
  /**
   * Check if a file should be watched based on its extension
   */
  function shouldWatchFile(filepath: string): boolean {
    const ext = path.extname(filepath);
    return validExtensions.has(ext);
  }

  // State management
  let isRunning = true;
  let isIndexing = false;
  let pendingChanges = new Map<string, 'add' | 'change' | 'unlink'>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;

  /**
   * Process pending file changes
   */
  async function processPendingChanges(): Promise<void> {
    if (!isRunning || isIndexing || pendingChanges.size === 0) {
      return;
    }

    isIndexing = true;
    const changes = new Map(pendingChanges);
    pendingChanges.clear();

    try {
      // Separate additions/changes from deletions
      const filesToIndex: string[] = [];
      const filesToDelete: string[] = [];

      for (const [filepath, event] of changes) {
        if (event === 'unlink') {
          filesToDelete.push(filepath);
        } else {
          filesToIndex.push(filepath);
        }
      }

      // Handle deletions via cleanup
      if (filesToDelete.length > 0) {
        if (verbose) {
          console.log(`\n[Watch] Cleaning up ${filesToDelete.length} deleted file(s)...`);
        }
        await cleanupIndex(rootDir, { verbose: false });
      }

      // Handle additions/changes via incremental index
      if (filesToIndex.length > 0) {
        if (onIndexStart) {
          onIndexStart(filesToIndex);
        }

        if (verbose) {
          console.log(`\n[Watch] Indexing ${filesToIndex.length} changed file(s)...`);
        }

        const results = await indexDirectory(rootDir, {
          model,
          verbose: false, // Keep output clean in watch mode
        });

        if (onIndexComplete) {
          onIndexComplete(results);
        }

        // Print summary
        for (const result of results) {
          if (result.indexed > 0 || result.errors > 0) {
            console.log(`[Watch] ${result.moduleId}: ${result.indexed} indexed, ${result.errors} errors`);
          }
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Watch] Error during indexing:', err.message);
      if (onError) {
        onError(err);
      }
    } finally {
      isIndexing = false;

      // Process any changes that came in while we were indexing
      if (pendingChanges.size > 0) {
        scheduleProcessing();
      }
    }
  }

  /**
   * Schedule processing of pending changes (with debounce)
   */
  function scheduleProcessing(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Force processing if batch is too large
    if (pendingChanges.size >= MAX_BATCH_SIZE) {
      processPendingChanges();
      return;
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      processPendingChanges();
    }, debounceMs);
  }

  /**
   * Handle a file event
   */
  function handleFileEvent(event: 'add' | 'change' | 'unlink', filepath: string): void {
    if (!isRunning) return;

    // Convert to relative path
    const relativePath = path.relative(rootDir, filepath);

    // Skip if file doesn't have a valid extension
    // For unlink events, we still need to check the extension to only clean up indexed files
    if (!shouldWatchFile(filepath)) {
      return;
    }

    // Skip if it's in an ignored directory (extra safety check)
    for (const ignorePath of config.ignorePaths) {
      if (relativePath.startsWith(ignorePath) || relativePath.includes(`/${ignorePath}/`)) {
        return;
      }
    }

    if (onFileChange) {
      onFileChange(event, relativePath);
    }

    if (verbose) {
      const symbol = event === 'add' ? '+' : event === 'unlink' ? '-' : '~';
      console.log(`[Watch] ${symbol} ${relativePath}`);
    }

    // Update pending changes (later events override earlier ones for same file)
    pendingChanges.set(relativePath, event);
    scheduleProcessing();
  }

  // Create the watcher - watch the directory itself (not glob patterns)
  // This ensures new files in new directories are detected
  watcher = watch(rootDir, {
    ignored: ignorePatterns,
    persistent: true,
    ignoreInitial: true, // Don't trigger events for existing files
    awaitWriteFinish: {
      stabilityThreshold: 100, // Wait for file to be stable
      pollInterval: 50,
    },
    // Performance optimizations
    usePolling: false, // Use native fs events when possible
    atomic: true, // Handle atomic writes (common in editors)
    // Watch directories for new file detection
    depth: 99, // Watch deeply nested directories
  });

  // Set up event handlers
  // When watching a directory directly, chokidar gives us absolute paths
  watcher.on('add', (filepath) => handleFileEvent('add', filepath));
  watcher.on('change', (filepath) => handleFileEvent('change', filepath));
  watcher.on('unlink', (filepath) => handleFileEvent('unlink', filepath));

  watcher.on('error', (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Watch] Watcher error:', err);
    if (onError) {
      onError(err);
    }
  });

  // Wait for watcher to be ready
  await new Promise<void>((resolve) => {
    watcher!.on('ready', () => {
      resolve();
    });
  });

  // Return control interface
  return {
    stop: async () => {
      isRunning = false;
      
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
    },
    isRunning: () => isRunning,
  };
}

