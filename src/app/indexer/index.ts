// Main indexer - coordinates modules for indexing files
import { fdir } from "fdir";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import {
  Config,
  IndexContext,
  IndexModule,
  ModuleManifest,
  GlobalManifest,
  FileIndex,
} from "../../types";
import {
  DEFAULT_CONFIG,
  loadConfig,
  getModuleIndexPath,
  getModuleManifestPath,
  getGlobalManifestPath,
  getModuleConfig,
  getIndexLocation,
  getRaggrepDir,
} from "../../infrastructure/config";
import { registry, registerBuiltInModules } from "../../modules/registry";
import type { EmbeddingModelName, Logger } from "../../domain/ports";
import { IntrospectionIndex } from "../../infrastructure/introspection";
import { createLogger, createSilentLogger } from "../../infrastructure/logger";

// ============================================================================
// Freshness Check Caching
// ============================================================================

/**
 * Cache for freshness check results.
 * Avoids expensive filesystem scans when running multiple queries in succession.
 */
interface FreshnessCache {
  rootDir: string;
  result: EnsureFreshResult;
  timestamp: number;
  manifestMtime: number;
}

/** Cache TTL in milliseconds (5 seconds) */
const FRESHNESS_CACHE_TTL_MS = 5000;

/** In-memory freshness cache */
let freshnessCache: FreshnessCache | null = null;

/**
 * Clear the freshness cache.
 * Call this after explicit indexing operations.
 */
export function clearFreshnessCache(): void {
  freshnessCache = null;
}

// ============================================================================
// Content Hashing
// ============================================================================

/**
 * Compute a SHA-256 hash of file content.
 * Used for reliable change detection that's immune to git mtime changes.
 *
 * @param content - File content to hash
 * @returns Hex-encoded SHA-256 hash
 */
function computeContentHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

// ============================================================================
// Parallel Processing Utilities
// ============================================================================

/**
 * Process items in parallel with controlled concurrency.
 * Returns results in the same order as input items.
 *
 * @param items - Items to process
 * @param processor - Async function to process each item
 * @param concurrency - Maximum number of concurrent operations
 * @returns Array of results (or errors) in input order
 */
async function parallelMap<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<
  Array<{ success: true; value: R } | { success: false; error: unknown }>
> {
  const results: Array<
    { success: true; value: R } | { success: false; error: unknown }
  > = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      try {
        const value = await processor(item, index);
        results[index] = { success: true, value };
      } catch (error) {
        results[index] = { success: false, error };
      }
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

/**
 * Current index schema version.
 * Increment this when making breaking changes to the index format.
 * This is separate from the package version to allow non-breaking updates.
 *
 * History:
 * - 1.0.0: Initial version
 * - 1.1.0: Changed default embedding model to bge-small-en-v1.5, added nomic-embed-text-v1.5
 * - 2.0.0: Tree-sitter integration, vocabulary extraction, README context, full file chunks, hierarchical markdown
 */
const INDEX_SCHEMA_VERSION = "2.0.0";

export interface IndexResult {
  moduleId: string;
  indexed: number;
  skipped: number;
  errors: number;
  /** Time taken in milliseconds */
  durationMs?: number;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

/**
 * Get optimal concurrency based on CPU specs.
 *
 * Uses the number of CPU cores with some considerations:
 * - Minimum: 2 (ensure some parallelism)
 * - Maximum: 16 (avoid diminishing returns / memory pressure)
 * - For embedding generation, we leave 1-2 cores free for the system
 *
 * @returns Optimal concurrency value
 */
function getOptimalConcurrency(): number {
  const cpuCount = os.cpus().length;

  // Leave some cores for system/other processes
  // For 4 cores: use 3
  // For 8 cores: use 6
  // For 16+ cores: use 12-14
  const optimal = Math.max(2, Math.min(16, Math.floor(cpuCount * 0.75)));

  return optimal;
}

/** Default concurrency for parallel file processing (dynamic based on CPU) */
const DEFAULT_CONCURRENCY = getOptimalConcurrency();

/** 
 * Higher concurrency for I/O-bound operations like file stat.
 * Since stat is I/O-bound (not CPU-bound), we can run many more in parallel.
 */
const STAT_CONCURRENCY = Math.max(32, getOptimalConcurrency() * 4);

export interface IndexOptions {
  /** Override the embedding model (semantic module) */
  model?: EmbeddingModelName;
  /** Show detailed progress */
  verbose?: boolean;
  /** Suppress most output (for use during query) */
  quiet?: boolean;
  /** Logger for progress reporting. If not provided, uses console by default (quiet mode uses silent logger) */
  logger?: Logger;
  /** Number of files to process in parallel (default: auto based on CPU cores) */
  concurrency?: number;
  /** Show timing information for each stage */
  timing?: boolean;
}

/** Timing information for performance profiling */
export interface TimingInfo {
  /** Total time in milliseconds */
  totalMs: number;
  /** Time spent on file discovery (glob) */
  fileDiscoveryMs: number;
  /** Time spent on stat checks */
  statCheckMs: number;
  /** Time spent on indexing changed files */
  indexingMs: number;
  /** Time spent on cleanup operations */
  cleanupMs: number;
  /** Number of files discovered on disk */
  filesDiscovered: number;
  /** Number of files that had stat checks performed (may be > filesDiscovered due to multiple modules) */
  filesStatChecked: number;
  /** Number of files with detected changes (mtime or size changed) that went to Phase 2 */
  filesWithChanges: number;
  /** Number of files that were actually re-indexed (content changed) */
  filesReindexed: number;
  /** Whether result was from cache */
  fromCache: boolean;
  /** Diagnostic: breakdown of why files went to Phase 2 */
  phase2Reasons?: {
    newFiles: number;
    noFileSize: number;
    sizeMismatch: number;
    noContentHash: number;
  };
}

export interface EnsureFreshResult {
  /** Number of files indexed (new or modified) */
  indexed: number;
  /** Number of stale entries removed (deleted files) */
  removed: number;
  /** Number of files unchanged (used cache) */
  unchanged: number;
  /** Timing information (only present if timing option was enabled) */
  timing?: TimingInfo;
}

export interface CleanupResult {
  moduleId: string;
  /** Number of stale entries removed */
  removed: number;
  /** Number of valid entries kept */
  kept: number;
}

export interface IndexStatus {
  /** Whether an index exists */
  exists: boolean;
  /** Root directory path */
  rootDir: string;
  /** Index directory path */
  indexDir: string;
  /** Last time the index was updated */
  lastUpdated?: string;
  /** Active modules and their file counts */
  modules: Array<{
    id: string;
    fileCount: number;
    lastUpdated: string;
  }>;
  /** Total number of indexed files */
  totalFiles: number;
}

/**
 * Index a directory using all enabled modules
 */
export async function indexDirectory(
  rootDir: string,
  options: IndexOptions = {}
): Promise<IndexResult[]> {
  const verbose = options.verbose ?? false;
  const quiet = options.quiet ?? false;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  // Clear freshness cache since we're explicitly indexing
  clearFreshnessCache();

  // Create logger based on options
  const logger: Logger = options.logger
    ? options.logger
    : quiet
    ? createSilentLogger()
    : createLogger({ verbose });

  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  // Show index location
  const location = getIndexLocation(rootDir);
  logger.info(`Indexing directory: ${rootDir}`);
  logger.info(`Index location: ${location.indexDir}`);
  logger.debug(`Concurrency: ${concurrency}`);

  // Load config
  const config = await loadConfig(rootDir);

  // Initialize introspection
  const introspection = new IntrospectionIndex(rootDir);
  await introspection.initialize();
  const structure = introspection.getStructure();
  if (structure?.isMonorepo) {
    logger.debug(
      `Detected monorepo with ${structure.projects.length} projects`
    );
  }

  // Register built-in modules
  await registerBuiltInModules();

  // Get enabled modules
  const enabledModules = registry.getEnabled(config);

  if (enabledModules.length === 0) {
    logger.info("No modules enabled. Check your configuration.");
    return [];
  }

  logger.info(`Enabled modules: ${enabledModules.map((m) => m.id).join(", ")}`);

  // Get all files matching extensions
  const files = await findFiles(rootDir, config);
  logger.info(`Found ${files.length} files to index`);

  // Track overall timing
  const overallStart = Date.now();

  // Index with each module
  const results: IndexResult[] = [];

  for (const module of enabledModules) {
    const moduleStart = Date.now();
    logger.info(`\n[${module.name}] Starting indexing...`);

    // Initialize module if needed
    const moduleConfig = getModuleConfig(config, module.id);
    if (module.initialize && moduleConfig) {
      // Apply CLI overrides to module config, including logger
      const configWithOverrides = { ...moduleConfig };
      if (options.model && module.id === "language/typescript") {
        configWithOverrides.options = {
          ...configWithOverrides.options,
          embeddingModel: options.model,
        };
      }
      // Pass logger to module via options
      configWithOverrides.options = {
        ...configWithOverrides.options,
        logger,
      };
      await module.initialize(configWithOverrides);
    }

    // Pre-filter files that this module supports
    const moduleFiles = module.supportsFile
      ? files.filter((f) => module.supportsFile!(f))
      : files;

    logger.info(`  Processing ${moduleFiles.length} files...`);

    const result = await indexWithModule(
      rootDir,
      moduleFiles,
      module,
      config,
      verbose,
      introspection,
      logger,
      concurrency
    );
    results.push(result);

    // Call finalize to build secondary indexes (Tier 1, BM25, etc.)
    if (module.finalize) {
      logger.info(`[${module.name}] Building secondary indexes...`);
      const ctx: IndexContext = {
        rootDir,
        config,
        readFile: async (filepath: string) => {
          const fullPath = path.isAbsolute(filepath)
            ? filepath
            : path.join(rootDir, filepath);
          return fs.readFile(fullPath, "utf-8");
        },
        getFileStats: async (filepath: string) => {
          const fullPath = path.isAbsolute(filepath)
            ? filepath
            : path.join(rootDir, filepath);
          const stats = await fs.stat(fullPath);
          return { lastModified: stats.mtime.toISOString() };
        },
      };
      await module.finalize(ctx);
    }

    const moduleDuration = Date.now() - moduleStart;
    result.durationMs = moduleDuration;

    logger.info(
      `[${module.name}] Complete: ${result.indexed} indexed, ${
        result.skipped
      } skipped, ${result.errors} errors (${formatDuration(moduleDuration)})`
    );
  }

  // Save introspection data
  await introspection.save(config);

  // Log overall timing
  const overallDuration = Date.now() - overallStart;
  logger.info(`\nIndexing complete in ${formatDuration(overallDuration)}`);

  // Log summary
  const totalIndexed = results.reduce((sum, r) => sum + r.indexed, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
  logger.info(
    `Total: ${totalIndexed} indexed, ${totalSkipped} skipped, ${totalErrors} errors`
  );

  // Update global manifest
  await updateGlobalManifest(rootDir, enabledModules, config);

  return results;
}

/**
 * Check if the existing index version is compatible with the current schema.
 * Returns true if compatible, false if needs rebuild.
 */
async function isIndexVersionCompatible(rootDir: string): Promise<boolean> {
  const config = await loadConfig(rootDir);
  const globalManifestPath = getGlobalManifestPath(rootDir, config);

  try {
    const content = await fs.readFile(globalManifestPath, "utf-8");
    const manifest: GlobalManifest = JSON.parse(content);

    // Check if version matches current schema version
    return manifest.version === INDEX_SCHEMA_VERSION;
  } catch {
    // Can't read manifest - treat as incompatible
    return false;
  }
}

/**
 * Delete the entire index directory to allow a clean rebuild.
 */
async function deleteIndex(rootDir: string): Promise<void> {
  const indexDir = getRaggrepDir(rootDir);

  try {
    await fs.rm(indexDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist, that's okay
  }
}

/**
 * Result of a reset operation
 */
export interface ResetResult {
  /** Whether the reset was successful */
  success: boolean;
  /** The index directory that was removed */
  indexDir: string;
}

/**
 * Reset (delete) the index for a directory.
 *
 * @param rootDir - Root directory of the project
 * @returns ResetResult with success status
 * @throws Error if no index exists
 */
export async function resetIndex(rootDir: string): Promise<ResetResult> {
  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  // Clear freshness cache
  clearFreshnessCache();

  // Check if index exists
  const status = await getIndexStatus(rootDir);

  if (!status.exists) {
    throw new Error(`No index found for ${rootDir}`);
  }

  // Delete the index
  await deleteIndex(rootDir);

  return {
    success: true,
    indexDir: status.indexDir,
  };
}

/**
 * Ensure the index is fresh by checking for changes and updating incrementally.
 * This function is designed to be called before search to transparently manage the index.
 *
 * - If no index exists, creates a full index
 * - If index version is incompatible, rebuilds from scratch
 * - If files have changed, re-indexes only the modified files
 * - If files have been deleted, removes stale entries
 * - If nothing changed, returns immediately (uses cache)
 *
 * @param rootDir - Root directory of the project
 * @param options - Index options
 * @returns Statistics about what was updated
 */
export async function ensureIndexFresh(
  rootDir: string,
  options: IndexOptions = {}
): Promise<EnsureFreshResult> {
  const verbose = options.verbose ?? false;
  const quiet = options.quiet ?? false;
  const showTiming = options.timing ?? false;

  // Timing tracking
  const startTime = Date.now();
  let fileDiscoveryMs = 0;
  let statCheckMs = 0;
  let indexingMs = 0;
  let cleanupMs = 0;
  let filesDiscovered = 0;
  let filesStatChecked = 0;
  let filesWithChanges = 0; // Files that went to Phase 2 (mtime/size changed)
  let filesReindexed = 0; // Files that were actually re-indexed (content changed)
  
  // Diagnostic counters: cumulative across all modules
  let totalDiagNewFiles = 0;
  let totalDiagNoFileSize = 0;
  let totalDiagSizeMismatch = 0;
  let totalDiagNoContentHash = 0;

  // Create logger based on options
  const logger: Logger = options.logger
    ? options.logger
    : quiet
    ? createSilentLogger()
    : createLogger({ verbose });

  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  // Check if index exists
  const status = await getIndexStatus(rootDir);

  if (!status.exists) {
    // No index exists - do full indexing
    clearFreshnessCache();
    logger.info("No index found. Creating index...\n");
    const results = await indexDirectory(rootDir, { ...options, logger });
    const totalIndexed = results.reduce((sum, r) => sum + r.indexed, 0);
    return { indexed: totalIndexed, removed: 0, unchanged: 0 };
  }

  // Index exists - check if version is compatible
  const versionCompatible = await isIndexVersionCompatible(rootDir);
  if (!versionCompatible) {
    // Incompatible index version - delete and rebuild
    clearFreshnessCache();
    logger.info("Index version incompatible. Rebuilding...\n");
    await deleteIndex(rootDir);
    const results = await indexDirectory(rootDir, { ...options, logger });
    const totalIndexed = results.reduce((sum, r) => sum + r.indexed, 0);
    return { indexed: totalIndexed, removed: 0, unchanged: 0 };
  }

  // Load config early to get manifest path for cache check
  const config = await loadConfig(rootDir);

  // Fast path: Check freshness cache
  // If we recently checked this directory and the manifest hasn't changed,
  // we can skip the expensive file-by-file scan
  const globalManifestPath = getGlobalManifestPath(rootDir, config);
  let currentManifestMtime = 0;
  try {
    const manifestStats = await fs.stat(globalManifestPath);
    currentManifestMtime = manifestStats.mtimeMs;
  } catch {
    // Manifest doesn't exist - will be created during indexing
  }

  const now = Date.now();
  if (
    freshnessCache &&
    freshnessCache.rootDir === rootDir &&
    now - freshnessCache.timestamp < FRESHNESS_CACHE_TTL_MS &&
    freshnessCache.manifestMtime === currentManifestMtime
  ) {
    // Cache hit - return cached result with timing info
    logger.debug("Using cached freshness check result");
    const cachedResult = { ...freshnessCache.result };
    if (showTiming) {
      cachedResult.timing = {
        totalMs: Date.now() - startTime,
        fileDiscoveryMs: 0,
        statCheckMs: 0,
        indexingMs: 0,
        cleanupMs: 0,
        filesDiscovered: 0,
        filesStatChecked: 0,
        filesWithChanges: 0,
        filesReindexed: 0,
        fromCache: true,
      };
    }
    return cachedResult;
  }

  // Register built-in modules
  await registerBuiltInModules();

  // Get enabled modules
  const enabledModules = registry.getEnabled(config);

  if (enabledModules.length === 0) {
    return { indexed: 0, removed: 0, unchanged: 0 };
  }

  // Initialize introspection and find files in parallel
  const fileDiscoveryStart = Date.now();
  const introspection = new IntrospectionIndex(rootDir);
  const [, currentFiles] = await Promise.all([
    introspection.initialize(),
    findFiles(rootDir, config),
  ]);
  fileDiscoveryMs = Date.now() - fileDiscoveryStart;
  filesDiscovered = currentFiles.length;

  const currentFileSet = new Set(
    currentFiles.map((f) => path.relative(rootDir, f))
  );

  let totalIndexed = 0;
  let totalRemoved = 0;
  let totalUnchanged = 0;

  for (const module of enabledModules) {
    // Initialize module if needed
    const moduleConfig = getModuleConfig(config, module.id);
    if (module.initialize && moduleConfig) {
      const configWithOverrides = { ...moduleConfig };
      if (options.model && module.id === "language/typescript") {
        configWithOverrides.options = {
          ...configWithOverrides.options,
          embeddingModel: options.model,
        };
      }
      // Pass logger to module
      configWithOverrides.options = {
        ...configWithOverrides.options,
        logger,
      };
      await module.initialize(configWithOverrides);
    }

    // Load manifest
    const manifest = await loadModuleManifest(rootDir, module.id, config);
    const indexPath = getModuleIndexPath(rootDir, module.id, config);

    // Find files to remove (in manifest but not on disk)
    const filesToRemove: string[] = [];
    for (const filepath of Object.keys(manifest.files)) {
      if (!currentFileSet.has(filepath)) {
        filesToRemove.push(filepath);
      }
    }

    // Remove stale entries in parallel
    // Also need to track files removed for literal index cleanup
    const cleanupStart = Date.now();
    const removedFilepaths: string[] = [];
    if (filesToRemove.length > 0) {
      await Promise.all(
        filesToRemove.map(async (filepath) => {
          logger.debug(`  Removing stale: ${filepath}`);
          // Remove main index file and symbolic index file in parallel
          const indexFilePath = path.join(
            indexPath,
            filepath.replace(/\.[^.]+$/, ".json")
          );
          const symbolicFilePath = path.join(
            indexPath,
            "symbolic",
            filepath.replace(/\.[^.]+$/, ".json")
          );
          await Promise.all([
            fs.unlink(indexFilePath).catch(() => {}), // Ignore errors
            fs.unlink(symbolicFilePath).catch(() => {}), // Ignore errors
          ]);
          delete manifest.files[filepath];
          removedFilepaths.push(filepath);
        })
      );
      totalRemoved += removedFilepaths.length;
    }

    // Clean up literal index for removed files
    if (removedFilepaths.length > 0) {
      try {
        const { LiteralIndex } = await import(
          "../../infrastructure/storage/literalIndex"
        );
        // LiteralIndex expects the base raggrep directory
        const raggrepDir = getRaggrepDir(rootDir, config);
        const literalIndex = new LiteralIndex(raggrepDir, module.id);
        await literalIndex.initialize();
        for (const filepath of removedFilepaths) {
          literalIndex.removeFile(filepath);
        }
        await literalIndex.save();
      } catch {
        // Literal index may not exist yet
      }
    }
    cleanupMs += Date.now() - cleanupStart;

    // Index new/modified files using two-phase approach:
    // Phase 1: Fast stat check with high I/O concurrency
    // Phase 2: Only index files that actually need it

    const ctx: IndexContext = {
      rootDir,
      config,
      readFile: async (filepath: string) => {
        const fullPath = path.isAbsolute(filepath)
          ? filepath
          : path.join(rootDir, filepath);
        return fs.readFile(fullPath, "utf-8");
      },
      getFileStats: async (filepath: string) => {
        const fullPath = path.isAbsolute(filepath)
          ? filepath
          : path.join(rootDir, filepath);
        const stats = await fs.stat(fullPath);
        return { lastModified: stats.mtime.toISOString() };
      },
      getIntrospection: (filepath: string) => introspection.getFile(filepath),
    };

    // ========================================================================
    // PHASE 1: Fast stat check (high I/O concurrency)
    // ========================================================================
    interface StatCheckResult {
      filepath: string;
      relativePath: string;
      lastModified: string;
      fileSize: number;
      needsCheck: boolean; // true if file needs content verification
      isNew: boolean; // true if file not in manifest
      existingContentHash?: string; // cached content hash from manifest
    }

    const statCheck = async (filepath: string): Promise<StatCheckResult | null> => {
      const relativePath = path.relative(rootDir, filepath);
      try {
        const stats = await fs.stat(filepath);
        const lastModified = stats.mtime.toISOString();
        const fileSize = stats.size;
        const existingEntry = manifest.files[relativePath];

        if (!existingEntry) {
          // New file - needs indexing
          return { filepath, relativePath, lastModified, fileSize, needsCheck: true, isNew: true };
        }

        if (existingEntry.lastModified === lastModified) {
          // Mtime unchanged - skip entirely
          return { filepath, relativePath, lastModified, fileSize, needsCheck: false, isNew: false };
        }

        // Mtime changed - check if size also changed
        if (existingEntry.fileSize !== undefined && existingEntry.fileSize === fileSize && existingEntry.contentHash) {
          // Size unchanged and we have a content hash - very likely content is the same
          // Skip content verification (trust size + existing hash)
          return { filepath, relativePath, lastModified, fileSize, needsCheck: false, isNew: false, existingContentHash: existingEntry.contentHash };
        }

        // Mtime changed and (size changed OR no cached hash) - needs content check
        return { filepath, relativePath, lastModified, fileSize, needsCheck: true, isNew: false, existingContentHash: existingEntry.contentHash };
      } catch {
        return null; // File inaccessible
      }
    };

    // Filter files to only those this module supports
    // If module doesn't have supportsFile, it processes all files (like core module)
    const moduleFiles = module.supportsFile 
      ? currentFiles.filter((f) => module.supportsFile!(f))
      : currentFiles;

    // Run stat checks with high concurrency (I/O bound)
    const statCheckStart = Date.now();
    const statResults = await parallelMap(moduleFiles, statCheck, STAT_CONCURRENCY);
    statCheckMs += Date.now() - statCheckStart;
    filesStatChecked += moduleFiles.length;
    
    // Separate files that need processing from unchanged files
    const filesToProcess: StatCheckResult[] = [];
    const filesWithMtimeOnlyChange: StatCheckResult[] = []; // Mtime changed but size same
    let unchangedCount = 0;
    
    // Diagnostic counters: why files need Phase 2
    let diagNewFiles = 0;
    let diagNoFileSize = 0;
    let diagSizeMismatch = 0;
    let diagNoContentHash = 0;

    for (const result of statResults) {
      if (!result.success || !result.value) continue;
      if (result.value.needsCheck) {
        filesToProcess.push(result.value);
        
        // Track reason for Phase 2 (for diagnostics)
        if (result.value.isNew) {
          diagNewFiles++;
        } else {
          const existingEntry = manifest.files[result.value.relativePath];
          if (existingEntry) {
            if (existingEntry.fileSize === undefined) diagNoFileSize++;
            else if (existingEntry.fileSize !== result.value.fileSize) diagSizeMismatch++;
            else if (!existingEntry.contentHash) diagNoContentHash++;
          }
        }
      } else {
        unchangedCount++;
        // Track files where mtime changed but we skipped due to size match
        // These need their mtime updated in the manifest
        const existingEntry = manifest.files[result.value.relativePath];
        if (existingEntry && existingEntry.lastModified !== result.value.lastModified) {
          filesWithMtimeOnlyChange.push(result.value);
        }
      }
    }
    
    // Accumulate diagnostic counters
    totalDiagNewFiles += diagNewFiles;
    totalDiagNoFileSize += diagNoFileSize;
    totalDiagSizeMismatch += diagSizeMismatch;
    totalDiagNoContentHash += diagNoContentHash;
    
    // Log diagnostic info if there are many Phase 2 files
    if (filesToProcess.length > 100 && verbose) {
      logger.info(`  [Diagnostic] Phase 2 reasons: new=${diagNewFiles}, noSize=${diagNoFileSize}, sizeMismatch=${diagSizeMismatch}, noHash=${diagNoContentHash}`);
    }

    // Update manifest for files with mtime-only changes (size matched, so we trusted the hash)
    let mtimeOnlyUpdates = 0;
    for (const file of filesWithMtimeOnlyChange) {
      const existingEntry = manifest.files[file.relativePath];
      if (existingEntry) {
        manifest.files[file.relativePath] = {
          ...existingEntry,
          lastModified: file.lastModified,
          fileSize: file.fileSize,
        };
        mtimeOnlyUpdates++;
      }
    }

    // If nothing needs processing, save manifest if there were mtime updates and continue
    if (filesToProcess.length === 0) {
      totalUnchanged += unchangedCount;
      if (mtimeOnlyUpdates > 0) {
        manifest.lastUpdated = new Date().toISOString();
        await writeModuleManifest(rootDir, module.id, manifest, config);
      }
      continue; // Move to next module
    }

    // ========================================================================
    // PHASE 2: Process changed files (normal concurrency for CPU-bound work)
    // ========================================================================
    let completedCount = 0;
    const totalToProcess = filesToProcess.length;

    const processChangedFile = async (
      statResult: StatCheckResult
    ): Promise<IncrementalFileResult> => {
      const { filepath, relativePath, lastModified, fileSize, isNew } = statResult;

      try {
        // Read file content
        const content = await fs.readFile(filepath, "utf-8");
        const contentHash = computeContentHash(content);
        const existingEntry = manifest.files[relativePath];

        // Check if content actually changed (handles git branch switches)
        if (!isNew && existingEntry?.contentHash && existingEntry.contentHash === contentHash) {
          completedCount++;
          // Content unchanged, just mtime update
          return {
            relativePath,
            status: "mtime_updated",
            lastModified,
            fileSize,
            contentHash,
          };
        }

        // File is new or content actually changed - index it
        completedCount++;
        logger.progress(
          `  [${completedCount}/${totalToProcess}] Indexing: ${relativePath}`
        );

        introspection.addFile(relativePath, content);

        const fileIndex = await module.indexFile(relativePath, content, ctx);

        if (!fileIndex) {
          return { relativePath, status: "unchanged", fileSize };
        }

        await writeFileIndex(
          rootDir,
          module.id,
          relativePath,
          fileIndex,
          config
        );

        return {
          relativePath,
          status: "indexed",
          lastModified,
          fileSize,
          chunkCount: fileIndex.chunks.length,
          contentHash,
        };
      } catch (error) {
        completedCount++;
        return { relativePath, status: "error", error };
      }
    };

    // Run indexing with normal concurrency (CPU bound)
    const indexingStart = Date.now();
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const results = await parallelMap(filesToProcess, processChangedFile, concurrency);
    indexingMs += Date.now() - indexingStart;
    filesWithChanges += filesToProcess.length;

    // Add unchanged files to total
    totalUnchanged += unchangedCount;

    // Clear progress line
    logger.clearProgress();

    // Process results and update manifest
    let mtimeUpdates = 0;
    for (const item of results) {
      if (!item.success) {
        continue;
      }

      const fileResult = item.value;
      switch (fileResult.status) {
        case "indexed":
          manifest.files[fileResult.relativePath] = {
            lastModified: fileResult.lastModified!,
            chunkCount: fileResult.chunkCount!,
            contentHash: fileResult.contentHash,
            fileSize: fileResult.fileSize,
          };
          totalIndexed++;
          break;
        case "mtime_updated":
          // Update mtime without re-indexing
          if (manifest.files[fileResult.relativePath]) {
            manifest.files[fileResult.relativePath] = {
              ...manifest.files[fileResult.relativePath],
              lastModified: fileResult.lastModified!,
              contentHash: fileResult.contentHash,
              fileSize: fileResult.fileSize,
            };
            mtimeUpdates++;
          }
          totalUnchanged++;
          break;
        case "unchanged":
          totalUnchanged++;
          break;
        case "error":
          logger.error(
            `  Error indexing ${fileResult.relativePath}: ${fileResult.error}`
          );
          break;
      }
    }

    // Update manifest if there were any changes (including mtime-only updates)
    const hasManifestChanges = totalIndexed > 0 || totalRemoved > 0 || mtimeUpdates > 0 || mtimeOnlyUpdates > 0;
    if (hasManifestChanges) {
      manifest.lastUpdated = new Date().toISOString();
      await writeModuleManifest(rootDir, module.id, manifest, config);
    }

    // Only call finalize when there are actual content changes (not just mtime updates)
    const hasContentChanges = totalIndexed > 0 || totalRemoved > 0;
    if (hasContentChanges && module.finalize) {
      await module.finalize(ctx);
    }

    // Clean up empty directories
    if (totalRemoved > 0) {
      await cleanupEmptyDirectories(indexPath);
    }
  }

  // Save introspection if there were changes
  if (totalIndexed > 0) {
    await introspection.save(config);
  }

  // Update global manifest if needed
  if (totalIndexed > 0 || totalRemoved > 0) {
    await updateGlobalManifest(rootDir, enabledModules, config);
    // Clear cache since manifest changed
    clearFreshnessCache();
  }

  const result: EnsureFreshResult = {
    indexed: totalIndexed,
    removed: totalRemoved,
    unchanged: totalUnchanged,
  };

  // Add timing info if requested
  if (showTiming) {
    result.timing = {
      totalMs: Date.now() - startTime,
      fileDiscoveryMs,
      statCheckMs,
      indexingMs,
      cleanupMs,
      filesDiscovered,
      filesStatChecked,
      filesWithChanges,
      filesReindexed: totalIndexed, // Files that actually had content changes
      fromCache: false,
      phase2Reasons: {
        newFiles: totalDiagNewFiles,
        noFileSize: totalDiagNoFileSize,
        sizeMismatch: totalDiagSizeMismatch,
        noContentHash: totalDiagNoContentHash,
      },
    };
  }

  // Cache the result for subsequent queries
  // Re-read manifest mtime in case it was updated during this run
  let finalManifestMtime = currentManifestMtime;
  try {
    const manifestStats = await fs.stat(globalManifestPath);
    finalManifestMtime = manifestStats.mtimeMs;
  } catch {
    // Ignore
  }

  freshnessCache = {
    rootDir,
    result: { indexed: totalIndexed, removed: totalRemoved, unchanged: totalUnchanged }, // Cache without timing
    timestamp: Date.now(),
    manifestMtime: finalManifestMtime,
  };

  return result;
}

/**
 * Result of processing a single file during full indexing
 */
interface FileProcessResult {
  relativePath: string;
  status: "indexed" | "skipped" | "error";
  lastModified?: string;
  fileSize?: number;
  chunkCount?: number;
  contentHash?: string;
  error?: unknown;
}

/**
 * Result of processing a single file during incremental (ensureIndexFresh) indexing
 */
interface IncrementalFileResult {
  relativePath: string;
  status: "indexed" | "unchanged" | "mtime_updated" | "error";
  lastModified?: string;
  fileSize?: number;
  chunkCount?: number;
  contentHash?: string;
  error?: unknown;
}

/**
 * Index files with a specific module using parallel processing
 */
async function indexWithModule(
  rootDir: string,
  files: string[],
  module: IndexModule,
  config: Config,
  verbose: boolean,
  introspection: IntrospectionIndex,
  logger: Logger,
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<IndexResult> {
  const result: IndexResult = {
    moduleId: module.id,
    indexed: 0,
    skipped: 0,
    errors: 0,
  };

  // Load existing manifest for this module
  const manifest = await loadModuleManifest(rootDir, module.id, config);
  const indexPath = getModuleIndexPath(rootDir, module.id, config);

  // Build set of current files for quick lookup
  const currentFileSet = new Set(files.map((f) => path.relative(rootDir, f)));

  // Clean up stale entries (files in manifest but no longer on disk)
  const filesToRemove: string[] = [];
  for (const filepath of Object.keys(manifest.files)) {
    if (!currentFileSet.has(filepath)) {
      filesToRemove.push(filepath);
    }
  }

  if (filesToRemove.length > 0) {
    logger.info(`  Removing ${filesToRemove.length} stale entries...`);
    for (const filepath of filesToRemove) {
      logger.debug(`    Removing: ${filepath}`);
      // Remove main index file
      const indexFilePath = path.join(
        indexPath,
        filepath.replace(/\.[^.]+$/, ".json")
      );
      try {
        await fs.unlink(indexFilePath);
      } catch {
        // Index file may not exist
      }
      // Remove symbolic index file
      const symbolicFilePath = path.join(
        indexPath,
        "symbolic",
        filepath.replace(/\.[^.]+$/, ".json")
      );
      try {
        await fs.unlink(symbolicFilePath);
      } catch {
        // Symbolic file may not exist
      }
      delete manifest.files[filepath];
    }
    // Clean up empty directories
    await cleanupEmptyDirectories(indexPath);
  }

  // Create index context
  const ctx: IndexContext = {
    rootDir,
    config,
    readFile: async (filepath: string) => {
      const fullPath = path.isAbsolute(filepath)
        ? filepath
        : path.join(rootDir, filepath);
      return fs.readFile(fullPath, "utf-8");
    },
    getFileStats: async (filepath: string) => {
      const fullPath = path.isAbsolute(filepath)
        ? filepath
        : path.join(rootDir, filepath);
      const stats = await fs.stat(fullPath);
      return { lastModified: stats.mtime.toISOString() };
    },
    getIntrospection: (filepath: string) => introspection.getFile(filepath),
  };

  const totalFiles = files.length;

  // Track progress across parallel operations
  let completedCount = 0;

  // Process files in parallel with concurrency control
  const processFile = async (
    filepath: string,
    _index: number
  ): Promise<FileProcessResult> => {
    const relativePath = path.relative(rootDir, filepath);

    try {
      const stats = await fs.stat(filepath);
      const lastModified = stats.mtime.toISOString();
      const fileSize = stats.size;
      const existingEntry = manifest.files[relativePath];

      // Fast path: if mtime unchanged, skip (no need to read file)
      if (existingEntry && existingEntry.lastModified === lastModified) {
        completedCount++;
        logger.debug(
          `  [${completedCount}/${totalFiles}] Skipped ${relativePath} (unchanged)`
        );
        return { relativePath, status: "skipped" };
      }

      // Read and index file
      const content = await fs.readFile(filepath, "utf-8");
      const contentHash = computeContentHash(content);

      // Check if content actually changed (handles git branch switches)
      if (existingEntry?.contentHash && existingEntry.contentHash === contentHash) {
        completedCount++;
        logger.debug(
          `  [${completedCount}/${totalFiles}] Skipped ${relativePath} (content unchanged)`
        );
        // Return with updated mtime but mark as skipped since content is same
        return {
          relativePath,
          status: "skipped",
          lastModified,
          fileSize,
          contentHash,
        };
      }

      // Add introspection for this file (thread-safe - just adds to a Map)
      introspection.addFile(relativePath, content);

      // Update progress
      completedCount++;
      logger.progress(
        `  [${completedCount}/${totalFiles}] Processing: ${relativePath}`
      );

      const fileIndex = await module.indexFile(relativePath, content, ctx);

      if (!fileIndex) {
        logger.debug(
          `  [${completedCount}/${totalFiles}] Skipped ${relativePath} (no chunks)`
        );
        return { relativePath, status: "skipped", fileSize };
      }

      // Write index file
      await writeFileIndex(rootDir, module.id, relativePath, fileIndex, config);

      return {
        relativePath,
        status: "indexed",
        lastModified,
        fileSize,
        chunkCount: fileIndex.chunks.length,
        contentHash,
      };
    } catch (error) {
      completedCount++;
      return { relativePath, status: "error", error };
    }
  };

  // Run parallel processing
  logger.debug(`  Using concurrency: ${concurrency}`);
  const results = await parallelMap(files, processFile, concurrency);

  // Clear progress line
  logger.clearProgress();

  // Process results and update manifest
  for (const item of results) {
    if (!item.success) {
      // This shouldn't happen as we catch errors in processFile
      result.errors++;
      continue;
    }

    const fileResult = item.value;
    switch (fileResult.status) {
      case "indexed":
        manifest.files[fileResult.relativePath] = {
          lastModified: fileResult.lastModified!,
          chunkCount: fileResult.chunkCount!,
          contentHash: fileResult.contentHash,
          fileSize: fileResult.fileSize,
        };
        result.indexed++;
        break;
      case "skipped":
        // If skipped due to content hash match but mtime changed, update mtime
        if (fileResult.lastModified && fileResult.contentHash) {
          const existingEntry = manifest.files[fileResult.relativePath];
          if (existingEntry) {
            manifest.files[fileResult.relativePath] = {
              ...existingEntry,
              lastModified: fileResult.lastModified,
              contentHash: fileResult.contentHash,
              fileSize: fileResult.fileSize,
            };
          }
        }
        result.skipped++;
        break;
      case "error":
        logger.error(
          `  Error indexing ${fileResult.relativePath}: ${fileResult.error}`
        );
        result.errors++;
        break;
    }
  }

  // Update manifest
  manifest.lastUpdated = new Date().toISOString();
  await writeModuleManifest(rootDir, module.id, manifest, config);

  return result;
}

async function findFiles(rootDir: string, config: Config): Promise<string[]> {
  // Build a set of valid extensions for fast lookup
  const validExtensions = new Set(config.extensions);
  
  // Build ignore patterns as directory names
  const ignoreDirs = new Set(config.ignorePaths);

  // Use fdir for fast directory traversal (10-100x faster than glob)
  const crawler = new fdir()
    .withFullPaths()
    .exclude((dirName) => ignoreDirs.has(dirName))
    .filter((filePath) => {
      const ext = path.extname(filePath);
      return validExtensions.has(ext);
    })
    .crawl(rootDir);

  const files = await crawler.withPromise();
  return files as string[];
}

async function loadModuleManifest(
  rootDir: string,
  moduleId: string,
  config: Config
): Promise<ModuleManifest> {
  const manifestPath = getModuleManifestPath(rootDir, moduleId, config);

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      moduleId,
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      files: {},
    };
  }
}

async function writeModuleManifest(
  rootDir: string,
  moduleId: string,
  manifest: ModuleManifest,
  config: Config
): Promise<void> {
  const manifestPath = getModuleManifestPath(rootDir, moduleId, config);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function writeFileIndex(
  rootDir: string,
  moduleId: string,
  filepath: string,
  fileIndex: FileIndex,
  config: Config
): Promise<void> {
  const indexPath = getModuleIndexPath(rootDir, moduleId, config);
  const indexFilePath = path.join(
    indexPath,
    filepath.replace(/\.[^.]+$/, ".json")
  );

  await fs.mkdir(path.dirname(indexFilePath), { recursive: true });
  await fs.writeFile(indexFilePath, JSON.stringify(fileIndex, null, 2));
}

async function updateGlobalManifest(
  rootDir: string,
  modules: IndexModule[],
  config: Config
): Promise<void> {
  const manifestPath = getGlobalManifestPath(rootDir, config);

  const manifest: GlobalManifest = {
    version: INDEX_SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    modules: modules.map((m) => m.id),
  };

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Options for cleanup operation
 */
export interface CleanupOptions {
  /** Show detailed progress */
  verbose?: boolean;
  /** Logger for progress reporting */
  logger?: Logger;
}

/**
 * Clean up stale index entries for files that no longer exist
 * @param rootDir - Root directory of the project
 * @param options - Cleanup options
 * @returns Array of cleanup results per module
 */
export async function cleanupIndex(
  rootDir: string,
  options: CleanupOptions = {}
): Promise<CleanupResult[]> {
  const verbose = options.verbose ?? false;

  // Create logger
  const logger: Logger = options.logger ?? createLogger({ verbose });

  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  logger.info(`Cleaning up index in: ${rootDir}`);

  // Load config
  const config = await loadConfig(rootDir);

  // Register built-in modules
  await registerBuiltInModules();

  // Get enabled modules
  const enabledModules = registry.getEnabled(config);

  if (enabledModules.length === 0) {
    logger.info("No modules enabled.");
    return [];
  }

  const results: CleanupResult[] = [];

  for (const module of enabledModules) {
    logger.info(`\n[${module.name}] Checking for stale entries...`);

    const result = await cleanupModuleIndex(rootDir, module.id, config, logger);
    results.push(result);

    logger.info(
      `[${module.name}] Removed ${result.removed} stale entries, kept ${result.kept} valid entries`
    );
  }

  return results;
}

/**
 * Clean up stale index entries for a specific module
 */
async function cleanupModuleIndex(
  rootDir: string,
  moduleId: string,
  config: Config,
  logger: Logger
): Promise<CleanupResult> {
  const result: CleanupResult = {
    moduleId,
    removed: 0,
    kept: 0,
  };

  // Load manifest
  const manifest = await loadModuleManifest(rootDir, moduleId, config);
  const indexPath = getModuleIndexPath(rootDir, moduleId, config);

  const filesToRemove: string[] = [];
  const updatedFiles: ModuleManifest["files"] = {};

  // Check each indexed file
  for (const [filepath, entry] of Object.entries(manifest.files)) {
    const fullPath = path.join(rootDir, filepath);

    try {
      await fs.access(fullPath);
      // File exists, keep it
      updatedFiles[filepath] = entry;
      result.kept++;
    } catch {
      // File doesn't exist, mark for removal
      filesToRemove.push(filepath);
      result.removed++;
      logger.debug(`  Removing stale entry: ${filepath}`);
    }
  }

  // Remove stale index files
  for (const filepath of filesToRemove) {
    const indexFilePath = path.join(
      indexPath,
      filepath.replace(/\.[^.]+$/, ".json")
    );
    try {
      await fs.unlink(indexFilePath);
    } catch {
      // Index file may not exist, that's okay
    }
  }

  // Update manifest with only valid files
  manifest.files = updatedFiles;
  manifest.lastUpdated = new Date().toISOString();
  await writeModuleManifest(rootDir, moduleId, manifest, config);

  // Clean up empty directories in the index
  await cleanupEmptyDirectories(indexPath);

  return result;
}

/**
 * Recursively remove empty directories
 */
async function cleanupEmptyDirectories(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    // Process subdirectories first
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(dir, entry.name);
        await cleanupEmptyDirectories(subDir);
      }
    }

    // Check if directory is now empty (re-read after potential subdirectory removal)
    const remainingEntries = await fs.readdir(dir);

    // Don't remove the root index directory or manifest files
    if (remainingEntries.length === 0) {
      await fs.rmdir(dir);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get the current status of the index
 * @param rootDir - Root directory of the project
 * @returns Index status information
 */
export async function getIndexStatus(rootDir: string): Promise<IndexStatus> {
  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  // Load config
  const config = await loadConfig(rootDir);

  // Get index location (now in temp directory)
  const location = getIndexLocation(rootDir);
  const indexDir = location.indexDir;

  const status: IndexStatus = {
    exists: false,
    rootDir,
    indexDir,
    modules: [],
    totalFiles: 0,
  };

  // Check if index directory exists
  try {
    await fs.access(indexDir);
  } catch {
    return status;
  }

  // Try to load global manifest
  try {
    const globalManifestPath = getGlobalManifestPath(rootDir, config);
    const content = await fs.readFile(globalManifestPath, "utf-8");
    const globalManifest: GlobalManifest = JSON.parse(content);

    status.exists = true;
    status.lastUpdated = globalManifest.lastUpdated;

    // Load each module's manifest
    for (const moduleId of globalManifest.modules) {
      try {
        const manifest = await loadModuleManifest(rootDir, moduleId, config);
        const fileCount = Object.keys(manifest.files).length;

        status.modules.push({
          id: moduleId,
          fileCount,
          lastUpdated: manifest.lastUpdated,
        });

        status.totalFiles += fileCount;
      } catch {
        // Module manifest doesn't exist or is corrupt
      }
    }
  } catch {
    // Global manifest doesn't exist - check if there's any index data
    try {
      const entries = await fs.readdir(path.join(indexDir, "index"));
      if (entries.length > 0) {
        status.exists = true;
        // Try to load manifests for known modules
        for (const entry of entries) {
          try {
            const manifest = await loadModuleManifest(rootDir, entry, config);
            const fileCount = Object.keys(manifest.files).length;

            status.modules.push({
              id: entry,
              fileCount,
              lastUpdated: manifest.lastUpdated,
            });

            status.totalFiles += fileCount;
          } catch {
            // Skip
          }
        }
      }
    } catch {
      // No index directory
    }
  }

  return status;
}

// Re-export watcher
export { watchDirectory, type WatchOptions, type FileWatcher } from "./watcher";
