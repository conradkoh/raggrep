// Search module - queries across all enabled modules
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Config,
  SearchContext,
  SearchOptions,
  SearchResult,
  FileIndex,
  IndexModule,
  GlobalManifest,
} from '../types';
import {
  loadConfig,
  getModuleIndexPath,
  getGlobalManifestPath,
  getModuleConfig,
} from '../utils/config';
import { registry, registerBuiltInModules } from '../modules/registry';

/**
 * Search across all enabled modules
 */
export async function search(
  rootDir: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  console.log(`Searching for: "${query}"`);

  // Load config
  const config = await loadConfig(rootDir);

  // Register built-in modules
  await registerBuiltInModules();

  // Check which modules have indexes
  const globalManifest = await loadGlobalManifest(rootDir, config);
  
  if (!globalManifest || globalManifest.modules.length === 0) {
    console.log('No index found. Run "bun run index" first.');
    return [];
  }

  // Get modules that are both enabled and have indexes
  const modulesToSearch: IndexModule[] = [];
  
  for (const moduleId of globalManifest.modules) {
    const module = registry.get(moduleId);
    const moduleConfig = getModuleConfig(config, moduleId);
    
    if (module && moduleConfig?.enabled) {
      // Initialize module if needed
      if (module.initialize) {
        await module.initialize(moduleConfig);
      }
      modulesToSearch.push(module);
    }
  }

  if (modulesToSearch.length === 0) {
    console.log('No enabled modules with indexes found.');
    return [];
  }

  // Search with each module and aggregate results
  const allResults: SearchResult[] = [];

  for (const module of modulesToSearch) {
    const ctx = createSearchContext(rootDir, module.id, config);
    const moduleResults = await module.search(query, ctx, options);
    allResults.push(...moduleResults);
  }

  // Sort all results by score
  allResults.sort((a, b) => b.score - a.score);

  // Return top K
  const topK = options.topK ?? 10;
  return allResults.slice(0, topK);
}

/**
 * Create a search context for a specific module
 */
function createSearchContext(
  rootDir: string,
  moduleId: string,
  config: Config
): SearchContext {
  const indexPath = getModuleIndexPath(rootDir, moduleId, config);

  return {
    rootDir,
    config,
    
    loadFileIndex: async (filepath: string): Promise<FileIndex | null> => {
      // filepath may or may not have an extension
      // If it has an extension, replace it with .json; otherwise append .json
      const hasExtension = /\.[^./]+$/.test(filepath);
      const indexFilePath = hasExtension
        ? path.join(indexPath, filepath.replace(/\.[^.]+$/, '.json'))
        : path.join(indexPath, filepath + '.json');
      
      try {
        const content = await fs.readFile(indexFilePath, 'utf-8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    },
    
    listIndexedFiles: async (): Promise<string[]> => {
      const files: string[] = [];
      await traverseDirectory(indexPath, files, indexPath);
      
      // Convert index file paths back to source file paths
      return files
        .filter(f => f.endsWith('.json') && !f.endsWith('manifest.json'))
        .map(f => {
          const relative = path.relative(indexPath, f);
          // Convert .json back to original extension (we'll handle this generically)
          return relative.replace(/\.json$/, '');
        });
    },
  };
}

async function traverseDirectory(dir: string, files: string[], basePath: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await traverseDirectory(fullPath, files, basePath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
}

async function loadGlobalManifest(rootDir: string, config: Config): Promise<GlobalManifest | null> {
  const manifestPath = getGlobalManifestPath(rootDir, config);

  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Format search results for display
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  let output = `Found ${results.length} results:\n\n`;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    output += `${i + 1}. ${result.filepath}:${result.chunk.startLine}-${result.chunk.endLine}\n`;
    output += `   Score: ${(result.score * 100).toFixed(1)}% | Module: ${result.moduleId}\n`;
    output += `   Type: ${result.chunk.type}\n`;
    output += `   Preview:\n`;

    // Show first 3 lines of content
    const lines = result.chunk.content.split('\n').slice(0, 3);
    for (const line of lines) {
      output += `      ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}\n`;
    }

    output += '\n';
  }

  return output;
}
