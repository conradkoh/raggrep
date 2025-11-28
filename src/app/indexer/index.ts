// Main indexer - coordinates modules for indexing files
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";
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
import type { EmbeddingModelName } from "../../domain/ports";
import { IntrospectionIndex } from "../../infrastructure/introspection";

/**
 * Current index schema version.
 * Increment this when making breaking changes to the index format.
 * This is separate from the package version to allow non-breaking updates.
 */
const INDEX_SCHEMA_VERSION = "1.0.0";

export interface IndexResult {
  moduleId: string;
  indexed: number;
  skipped: number;
  errors: number;
}

export interface IndexOptions {
  /** Override the embedding model (semantic module) */
  model?: EmbeddingModelName;
  /** Show detailed progress */
  verbose?: boolean;
  /** Suppress most output (for use during query) */
  quiet?: boolean;
}

export interface EnsureFreshResult {
  /** Number of files indexed (new or modified) */
  indexed: number;
  /** Number of stale entries removed (deleted files) */
  removed: number;
  /** Number of files unchanged (used cache) */
  unchanged: number;
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

  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  // Show index location
  const location = getIndexLocation(rootDir);
  if (!quiet) {
    console.log(`Indexing directory: ${rootDir}`);
    console.log(`Index location: ${location.indexDir}`);
  }

  // Load config
  const config = await loadConfig(rootDir);

  // Initialize introspection
  const introspection = new IntrospectionIndex(rootDir);
  await introspection.initialize();
  if (verbose) {
    const structure = introspection.getStructure();
    if (structure?.isMonorepo) {
      console.log(
        `Detected monorepo with ${structure.projects.length} projects`
      );
    }
  }

  // Register built-in modules
  await registerBuiltInModules();

  // Get enabled modules
  const enabledModules = registry.getEnabled(config);

  if (enabledModules.length === 0) {
    if (!quiet) {
      console.log("No modules enabled. Check your configuration.");
    }
    return [];
  }

  if (!quiet) {
    console.log(
      `Enabled modules: ${enabledModules.map((m) => m.id).join(", ")}`
    );
  }

  // Get all files matching extensions
  const files = await findFiles(rootDir, config);
  if (!quiet) {
    console.log(`Found ${files.length} files to index`);
  }

  // Index with each module
  const results: IndexResult[] = [];

  for (const module of enabledModules) {
    if (!quiet) {
      console.log(`\n[${module.name}] Starting indexing...`);
    }

    // Initialize module if needed
    const moduleConfig = getModuleConfig(config, module.id);
    if (module.initialize && moduleConfig) {
      // Apply CLI overrides to module config
      const configWithOverrides = { ...moduleConfig };
      if (options.model && module.id === "language/typescript") {
        configWithOverrides.options = {
          ...configWithOverrides.options,
          embeddingModel: options.model,
        };
      }
      await module.initialize(configWithOverrides);
    }

    const result = await indexWithModule(
      rootDir,
      files,
      module,
      config,
      verbose,
      introspection
    );
    results.push(result);

    // Call finalize to build secondary indexes (Tier 1, BM25, etc.)
    if (module.finalize) {
      if (!quiet) {
        console.log(`[${module.name}] Building secondary indexes...`);
      }
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

    if (!quiet) {
      console.log(
        `[${module.name}] Complete: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`
      );
    }
  }

  // Save introspection data
  await introspection.save(config);

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

  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  // Check if index exists
  const status = await getIndexStatus(rootDir);

  if (!status.exists) {
    // No index exists - do full indexing
    if (!quiet) {
      console.log("No index found. Creating index...\n");
    }
    const results = await indexDirectory(rootDir, { ...options, quiet });
    const totalIndexed = results.reduce((sum, r) => sum + r.indexed, 0);
    return { indexed: totalIndexed, removed: 0, unchanged: 0 };
  }

  // Index exists - check if version is compatible
  const versionCompatible = await isIndexVersionCompatible(rootDir);
  if (!versionCompatible) {
    // Incompatible index version - delete and rebuild
    if (!quiet) {
      console.log("Index version incompatible. Rebuilding...\n");
    }
    await deleteIndex(rootDir);
    const results = await indexDirectory(rootDir, { ...options, quiet });
    const totalIndexed = results.reduce((sum, r) => sum + r.indexed, 0);
    return { indexed: totalIndexed, removed: 0, unchanged: 0 };
  }

  // Index exists and is compatible - check for changes incrementally
  const config = await loadConfig(rootDir);

  // Register built-in modules
  await registerBuiltInModules();

  // Get enabled modules
  const enabledModules = registry.getEnabled(config);

  if (enabledModules.length === 0) {
    return { indexed: 0, removed: 0, unchanged: 0 };
  }

  // Initialize introspection
  const introspection = new IntrospectionIndex(rootDir);
  await introspection.initialize();

  // Get all current files
  const currentFiles = await findFiles(rootDir, config);
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

    // Remove stale entries
    for (const filepath of filesToRemove) {
      if (verbose) {
        console.log(`  Removing stale: ${filepath}`);
      }
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
      totalRemoved++;
    }

    // Index new/modified files
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

    for (const filepath of currentFiles) {
      const relativePath = path.relative(rootDir, filepath);

      try {
        const stats = await fs.stat(filepath);
        const lastModified = stats.mtime.toISOString();

        // Check if file needs re-indexing
        const existingEntry = manifest.files[relativePath];
        if (existingEntry && existingEntry.lastModified === lastModified) {
          totalUnchanged++;
          continue;
        }

        // File is new or modified - index it
        if (verbose) {
          console.log(`  Indexing: ${relativePath}`);
        }

        const content = await fs.readFile(filepath, "utf-8");
        introspection.addFile(relativePath, content);

        const fileIndex = await module.indexFile(relativePath, content, ctx);

        if (fileIndex) {
          await writeFileIndex(
            rootDir,
            module.id,
            relativePath,
            fileIndex,
            config
          );
          manifest.files[relativePath] = {
            lastModified,
            chunkCount: fileIndex.chunks.length,
          };
          totalIndexed++;
        }
      } catch (error) {
        if (verbose) {
          console.error(`  Error indexing ${relativePath}:`, error);
        }
      }
    }

    // Update manifest if there were changes
    if (totalIndexed > 0 || totalRemoved > 0) {
      manifest.lastUpdated = new Date().toISOString();
      await writeModuleManifest(rootDir, module.id, manifest, config);

      // Call finalize to rebuild secondary indexes
      if (module.finalize) {
        await module.finalize(ctx);
      }
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
  }

  return {
    indexed: totalIndexed,
    removed: totalRemoved,
    unchanged: totalUnchanged,
  };
}

/**
 * Index files with a specific module
 */
async function indexWithModule(
  rootDir: string,
  files: string[],
  module: IndexModule,
  config: Config,
  verbose: boolean,
  introspection: IntrospectionIndex
): Promise<IndexResult> {
  const result: IndexResult = {
    moduleId: module.id,
    indexed: 0,
    skipped: 0,
    errors: 0,
  };

  // Load existing manifest for this module
  const manifest = await loadModuleManifest(rootDir, module.id, config);

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

  // Process each file
  for (const filepath of files) {
    const relativePath = path.relative(rootDir, filepath);

    try {
      const stats = await fs.stat(filepath);
      const lastModified = stats.mtime.toISOString();

      // Check if file needs re-indexing
      const existingEntry = manifest.files[relativePath];
      if (existingEntry && existingEntry.lastModified === lastModified) {
        if (verbose) {
          console.log(`  Skipped ${relativePath} (unchanged)`);
        }
        result.skipped++;
        continue;
      }

      // Read and index file
      const content = await fs.readFile(filepath, "utf-8");

      // Add introspection for this file
      introspection.addFile(relativePath, content);

      if (verbose) {
        console.log(`  Processing ${relativePath}...`);
      }
      const fileIndex = await module.indexFile(relativePath, content, ctx);

      if (!fileIndex) {
        if (verbose) {
          console.log(`  Skipped ${relativePath} (no chunks)`);
        }
        result.skipped++;
        continue;
      }

      // Write index file
      await writeFileIndex(rootDir, module.id, relativePath, fileIndex, config);

      // Update manifest
      manifest.files[relativePath] = {
        lastModified,
        chunkCount: fileIndex.chunks.length,
      };

      result.indexed++;
    } catch (error) {
      console.error(`  Error indexing ${relativePath}:`, error);
      result.errors++;
    }
  }

  // Update manifest
  manifest.lastUpdated = new Date().toISOString();
  await writeModuleManifest(rootDir, module.id, manifest, config);

  return result;
}

async function findFiles(rootDir: string, config: Config): Promise<string[]> {
  const patterns = config.extensions.map((ext) => `**/*${ext}`);
  const ignorePatterns = config.ignorePaths.map((p) => `**/${p}/**`);

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: rootDir,
      absolute: true,
      ignore: ignorePatterns,
    });
    files.push(...matches);
  }

  return [...new Set(files)]; // Remove duplicates
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
 * Clean up stale index entries for files that no longer exist
 * @param rootDir - Root directory of the project
 * @param options - Cleanup options
 * @returns Array of cleanup results per module
 */
export async function cleanupIndex(
  rootDir: string,
  options: { verbose?: boolean } = {}
): Promise<CleanupResult[]> {
  const verbose = options.verbose ?? false;

  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  console.log(`Cleaning up index in: ${rootDir}`);

  // Load config
  const config = await loadConfig(rootDir);

  // Register built-in modules
  await registerBuiltInModules();

  // Get enabled modules
  const enabledModules = registry.getEnabled(config);

  if (enabledModules.length === 0) {
    console.log("No modules enabled.");
    return [];
  }

  const results: CleanupResult[] = [];

  for (const module of enabledModules) {
    console.log(`\n[${module.name}] Checking for stale entries...`);

    const result = await cleanupModuleIndex(
      rootDir,
      module.id,
      config,
      verbose
    );
    results.push(result);

    console.log(
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
  verbose: boolean
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

      if (verbose) {
        console.log(`  Removing stale entry: ${filepath}`);
      }
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
