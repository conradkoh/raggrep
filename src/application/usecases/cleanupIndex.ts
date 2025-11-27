/**
 * Cleanup Index Use Case
 * 
 * Removes stale index entries for files that no longer exist.
 */

import type { Config, ModuleManifest } from '../../domain/entities';
import type { FileSystem } from '../../domain/ports';
import type { IndexModule } from '../../types';

/**
 * Result of cleanup for a single module
 */
export interface CleanupResult {
  moduleId: string;
  /** Number of stale entries removed */
  removed: number;
  /** Number of valid entries kept */
  kept: number;
}

/**
 * Options for the cleanup use case
 */
export interface CleanupIndexOptions {
  /** Show verbose output */
  verbose?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Dependencies required by this use case
 */
export interface CleanupIndexDependencies {
  /** Filesystem abstraction */
  fileSystem: FileSystem;
  /** Load configuration */
  loadConfig: (rootDir: string) => Promise<Config>;
  /** Get enabled modules */
  getEnabledModules: (config: Config) => IndexModule[];
  /** Load module manifest */
  loadModuleManifest: (rootDir: string, moduleId: string, config: Config) => Promise<ModuleManifest | null>;
  /** Save module manifest */
  saveModuleManifest: (rootDir: string, moduleId: string, manifest: ModuleManifest, config: Config) => Promise<void>;
  /** Delete file index */
  deleteFileIndex: (rootDir: string, moduleId: string, filepath: string, config: Config) => Promise<void>;
}

/**
 * Clean up stale index entries.
 * 
 * This use case:
 * 1. Loads configuration
 * 2. For each module, checks if indexed files still exist
 * 3. Removes index entries for deleted files
 * 4. Updates manifests
 */
export async function cleanupIndex(
  rootDir: string,
  deps: CleanupIndexDependencies,
  options: CleanupIndexOptions = {}
): Promise<CleanupResult[]> {
  const { 
    fileSystem, 
    loadConfig, 
    getEnabledModules, 
    loadModuleManifest, 
    saveModuleManifest,
    deleteFileIndex 
  } = deps;
  const { verbose = false, onProgress = console.log } = options;

  // Resolve to absolute path
  rootDir = fileSystem.resolve(rootDir);
  onProgress(`Cleaning up index in: ${rootDir}`);

  // Load config
  const config = await loadConfig(rootDir);

  // Get enabled modules
  const modules = getEnabledModules(config);

  if (modules.length === 0) {
    onProgress('No modules enabled.');
    return [];
  }

  const results: CleanupResult[] = [];

  for (const module of modules) {
    onProgress(`\n[${module.name}] Checking for stale entries...`);

    const result = await cleanupModuleIndex(
      rootDir,
      module.id,
      config,
      fileSystem,
      loadModuleManifest,
      saveModuleManifest,
      deleteFileIndex,
      verbose,
      onProgress
    );

    results.push(result);
    onProgress(`[${module.name}] Removed ${result.removed} stale entries, kept ${result.kept} valid entries`);
  }

  return results;
}

/**
 * Clean up stale entries for a specific module
 */
async function cleanupModuleIndex(
  rootDir: string,
  moduleId: string,
  config: Config,
  fileSystem: FileSystem,
  loadModuleManifest: CleanupIndexDependencies['loadModuleManifest'],
  saveModuleManifest: CleanupIndexDependencies['saveModuleManifest'],
  deleteFileIndex: CleanupIndexDependencies['deleteFileIndex'],
  verbose: boolean,
  onProgress: (message: string) => void
): Promise<CleanupResult> {
  const result: CleanupResult = {
    moduleId,
    removed: 0,
    kept: 0,
  };

  // Load manifest
  const manifest = await loadModuleManifest(rootDir, moduleId, config);
  
  if (!manifest) {
    return result;
  }

  const updatedFiles: ModuleManifest['files'] = {};

  // Check each indexed file
  for (const [filepath, entry] of Object.entries(manifest.files)) {
    const fullPath = fileSystem.join(rootDir, filepath);

    if (await fileSystem.exists(fullPath)) {
      // File exists, keep it
      updatedFiles[filepath] = entry;
      result.kept++;
    } else {
      // File doesn't exist, remove from index
      try {
        await deleteFileIndex(rootDir, moduleId, filepath, config);
        result.removed++;

        if (verbose) {
          onProgress(`  Removing stale entry: ${filepath}`);
        }
      } catch (error) {
        onProgress(`  Error removing index for ${filepath}: ${error}`);
      }
    }
  }

  // Update manifest
  manifest.files = updatedFiles;
  manifest.lastUpdated = new Date().toISOString();
  await saveModuleManifest(rootDir, moduleId, manifest, config);

  return result;
}

