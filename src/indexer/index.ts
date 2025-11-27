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
