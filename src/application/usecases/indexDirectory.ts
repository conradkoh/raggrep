/**
 * Index Directory Use Case
 * 
 * Orchestrates the indexing of a codebase directory.
 * This is an application-level use case that coordinates domain entities
 * and infrastructure services.
 */

import type { Config } from '../../domain/entities';
import type { FileSystem } from '../../domain/ports';
import type { IndexModule, IndexContext } from '../../types';

/**
 * Result of indexing with a single module
 */
export interface IndexResult {
  moduleId: string;
  indexed: number;
  skipped: number;
  errors: number;
}

/**
 * Options for the index directory use case
 */
export interface IndexDirectoryOptions {
  /** Override configuration */
  config?: Partial<Config>;
  /** Show verbose output */
  verbose?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Dependencies required by this use case
 */
export interface IndexDirectoryDependencies {
  /** Filesystem abstraction */
  fileSystem: FileSystem;
  /** Load configuration */
  loadConfig: (rootDir: string) => Promise<Config>;
  /** Get enabled modules */
  getEnabledModules: (config: Config) => IndexModule[];
  /** Initialize a module */
  initializeModule: (module: IndexModule, config: Config) => Promise<void>;
}

/**
 * Index a directory using all enabled modules.
 * 
 * This use case:
 * 1. Loads configuration
 * 2. Finds all files matching extensions
 * 3. Indexes files with each enabled module
 * 4. Builds secondary indexes (Tier 1)
 * 5. Updates manifests
 */
export async function indexDirectory(
  rootDir: string,
  deps: IndexDirectoryDependencies,
  options: IndexDirectoryOptions = {}
): Promise<IndexResult[]> {
  const { fileSystem, loadConfig, getEnabledModules, initializeModule } = deps;
  const { verbose = false, onProgress = console.log } = options;

  // Resolve to absolute path
  rootDir = fileSystem.resolve(rootDir);
  onProgress(`Indexing directory: ${rootDir}`);

  // Load config
  const config = await loadConfig(rootDir);

  // Get enabled modules
  const modules = getEnabledModules(config);

  if (modules.length === 0) {
    onProgress('No modules enabled. Check your configuration.');
    return [];
  }

  onProgress(`Enabled modules: ${modules.map(m => m.id).join(', ')}`);

  // Find files
  const patterns = config.extensions.map(ext => `**/*${ext}`);
  const files = await fileSystem.findFiles(rootDir, patterns, config.ignorePaths);
  onProgress(`Found ${files.length} files to index`);

  // Index with each module
  const results: IndexResult[] = [];

  for (const module of modules) {
    onProgress(`\n[${module.name}] Starting indexing...`);

    // Initialize module
    await initializeModule(module, config);

    // Create index context
    const ctx: IndexContext = {
      rootDir,
      config,
      readFile: (filepath: string) => {
        const fullPath = fileSystem.resolve(rootDir, filepath);
        return fileSystem.readFile(fullPath);
      },
      getFileStats: async (filepath: string) => {
        const fullPath = fileSystem.resolve(rootDir, filepath);
        const stats = await fileSystem.getStats(fullPath);
        return { lastModified: stats.lastModified };
      },
    };

    // Index each file
    const result = await indexFilesWithModule(
      rootDir,
      files,
      module,
      ctx,
      fileSystem,
      verbose,
      onProgress
    );

    // Finalize (build Tier 1, etc.)
    if (module.finalize) {
      onProgress(`[${module.name}] Building secondary indexes...`);
      await module.finalize(ctx);
    }

    results.push(result);
    onProgress(`[${module.name}] Complete: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`);
  }

  return results;
}

/**
 * Index files with a specific module
 */
async function indexFilesWithModule(
  rootDir: string,
  files: string[],
  module: IndexModule,
  ctx: IndexContext,
  fileSystem: FileSystem,
  verbose: boolean,
  onProgress: (message: string) => void
): Promise<IndexResult> {
  const result: IndexResult = {
    moduleId: module.id,
    indexed: 0,
    skipped: 0,
    errors: 0,
  };

  for (const filepath of files) {
    const relativePath = fileSystem.relative(rootDir, filepath);

    try {
      // Read file content
      const content = await fileSystem.readFile(filepath);

      if (verbose) {
        onProgress(`  Processing ${relativePath}...`);
      }

      // Index file
      const fileIndex = await module.indexFile(relativePath, content, ctx);

      if (!fileIndex) {
        if (verbose) {
          onProgress(`  Skipped ${relativePath} (no chunks)`);
        }
        result.skipped++;
        continue;
      }

      result.indexed++;
    } catch (error) {
      onProgress(`  Error indexing ${relativePath}: ${error}`);
      result.errors++;
    }
  }

  return result;
}

