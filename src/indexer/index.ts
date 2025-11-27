// Main indexer - coordinates modules for indexing files
import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Config,
  IndexContext,
  IndexModule,
  ModuleManifest,
  GlobalManifest,
  FileIndex,
} from '../types';
import {
  DEFAULT_CONFIG,
  loadConfig,
  getModuleIndexPath,
  getModuleManifestPath,
  getGlobalManifestPath,
  getModuleConfig,
} from '../utils/config';
import { registry, registerBuiltInModules } from '../modules/registry';
import { EmbeddingModelName } from '../utils/embeddings';

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
}

export interface CleanupResult {
  moduleId: string;
  /** Number of stale entries removed */
  removed: number;
  /** Number of valid entries kept */
  kept: number;
}

/**
 * Index a directory using all enabled modules
 */
export async function indexDirectory(rootDir: string, options: IndexOptions = {}): Promise<IndexResult[]> {
  const verbose = options.verbose ?? false;
  
  // Ensure absolute path
  rootDir = path.resolve(rootDir);
  
  console.log(`Indexing directory: ${rootDir}`);

  // Load config
  const config = await loadConfig(rootDir);

  // Register built-in modules
  await registerBuiltInModules();

  // Get enabled modules
  const enabledModules = registry.getEnabled(config);

  if (enabledModules.length === 0) {
    console.log('No modules enabled. Check your configuration.');
    return [];
  }

  console.log(`Enabled modules: ${enabledModules.map((m) => m.id).join(', ')}`);

  // Get all files matching extensions
  const files = await findFiles(rootDir, config);
  console.log(`Found ${files.length} files to index`);

  // Index with each module
  const results: IndexResult[] = [];

  for (const module of enabledModules) {
    console.log(`\n[${module.name}] Starting indexing...`);

    // Initialize module if needed
    const moduleConfig = getModuleConfig(config, module.id);
    if (module.initialize && moduleConfig) {
      // Apply CLI overrides to module config
      const configWithOverrides = { ...moduleConfig };
      if (options.model && module.id === 'semantic') {
        configWithOverrides.options = {
          ...configWithOverrides.options,
          embeddingModel: options.model,
        };
      }
      await module.initialize(configWithOverrides);
    }

    const result = await indexWithModule(rootDir, files, module, config, verbose);
    results.push(result);

    console.log(`[${module.name}] Complete: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`);
  }

  // Update global manifest
  await updateGlobalManifest(rootDir, enabledModules, config);

  return results;
}

/**
 * Index files with a specific module
 */
async function indexWithModule(
  rootDir: string,
  files: string[],
  module: IndexModule,
  config: Config,
  verbose: boolean
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
      const fullPath = path.isAbsolute(filepath) ? filepath : path.join(rootDir, filepath);
      return fs.readFile(fullPath, 'utf-8');
    },
    getFileStats: async (filepath: string) => {
      const fullPath = path.isAbsolute(filepath) ? filepath : path.join(rootDir, filepath);
      const stats = await fs.stat(fullPath);
      return { lastModified: stats.mtime.toISOString() };
    },
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
      const content = await fs.readFile(filepath, 'utf-8');
      
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
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      moduleId,
      version: '1.0.0',
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
  const indexFilePath = path.join(indexPath, filepath.replace(/\.[^.]+$/, '.json'));

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
    version: config.version,
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
    console.log('No modules enabled.');
    return [];
  }

  const results: CleanupResult[] = [];

  for (const module of enabledModules) {
    console.log(`\n[${module.name}] Checking for stale entries...`);
    
    const result = await cleanupModuleIndex(rootDir, module.id, config, verbose);
    results.push(result);
    
    console.log(`[${module.name}] Removed ${result.removed} stale entries, kept ${result.kept} valid entries`);
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
  const updatedFiles: ModuleManifest['files'] = {};

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
    const indexFilePath = path.join(indexPath, filepath.replace(/\.[^.]+$/, '.json'));
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
