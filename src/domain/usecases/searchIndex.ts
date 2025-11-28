/**
 * Search Index Use Case
 * 
 * Orchestrates searching the indexed codebase.
 */

import type { Config, SearchResult, SearchOptions } from '../entities';
import type { FileSystem } from '../ports';
import type { IndexModule, SearchContext, FileIndex } from '../../types';

/**
 * Options for the search use case
 */
export interface SearchIndexOptions extends SearchOptions {
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Dependencies required by this use case
 */
export interface SearchIndexDependencies {
  /** Filesystem abstraction */
  fileSystem: FileSystem;
  /** Load configuration */
  loadConfig: (rootDir: string) => Promise<Config>;
  /** Get indexed modules from global manifest */
  getIndexedModules: (rootDir: string, config: Config) => Promise<string[]>;
  /** Get module by ID */
  getModule: (moduleId: string) => IndexModule | undefined;
  /** Initialize a module */
  initializeModule: (module: IndexModule, config: Config) => Promise<void>;
  /** Load file index */
  loadFileIndex: (rootDir: string, moduleId: string, filepath: string, config: Config) => Promise<FileIndex | null>;
  /** List indexed files for a module */
  listIndexedFiles: (rootDir: string, moduleId: string, config: Config) => Promise<string[]>;
}

/**
 * Search the indexed codebase.
 * 
 * This use case:
 * 1. Loads configuration
 * 2. Finds modules that have indexes
 * 3. Searches each module
 * 4. Aggregates and ranks results
 */
export async function searchIndex(
  rootDir: string,
  query: string,
  deps: SearchIndexDependencies,
  options: SearchIndexOptions = {}
): Promise<SearchResult[]> {
  const { 
    fileSystem, 
    loadConfig, 
    getIndexedModules, 
    getModule, 
    initializeModule,
    loadFileIndex,
    listIndexedFiles 
  } = deps;
  const { onProgress = console.log, topK = 10, minScore, filePatterns } = options;

  // Resolve to absolute path
  rootDir = fileSystem.resolve(rootDir);

  onProgress(`Searching for: "${query}"`);

  // Load config
  const config = await loadConfig(rootDir);

  // Get indexed modules
  const indexedModuleIds = await getIndexedModules(rootDir, config);

  if (indexedModuleIds.length === 0) {
    onProgress('No index found. Run "raggrep index" first.');
    return [];
  }

  // Get modules that are both enabled and have indexes
  const modulesToSearch: IndexModule[] = [];

  for (const moduleId of indexedModuleIds) {
    const module = getModule(moduleId);
    const moduleConfig = config.modules.find(m => m.id === moduleId);

    if (module && moduleConfig?.enabled) {
      await initializeModule(module, config);
      modulesToSearch.push(module);
    }
  }

  if (modulesToSearch.length === 0) {
    onProgress('No enabled modules with indexes found.');
    return [];
  }

  // Search with each module
  const allResults: SearchResult[] = [];

  for (const module of modulesToSearch) {
    const ctx = createSearchContext(
      rootDir,
      module.id,
      config,
      fileSystem,
      loadFileIndex,
      listIndexedFiles
    );

    const searchOptions: SearchOptions = { topK, minScore, filePatterns };
    const moduleResults = await module.search(query, ctx, searchOptions);
    allResults.push(...moduleResults);
  }

  // Sort by score descending
  allResults.sort((a, b) => b.score - a.score);

  // Return top K
  return allResults.slice(0, topK);
}

/**
 * Create a search context for a specific module
 */
function createSearchContext(
  rootDir: string,
  moduleId: string,
  config: Config,
  fileSystem: FileSystem,
  loadFileIndex: SearchIndexDependencies['loadFileIndex'],
  listIndexedFiles: SearchIndexDependencies['listIndexedFiles']
): SearchContext {
  return {
    rootDir,
    config,
    loadFileIndex: (filepath: string) => loadFileIndex(rootDir, moduleId, filepath, config),
    listIndexedFiles: () => listIndexedFiles(rootDir, moduleId, config),
  };
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
    const { chunk } = result;

    // Format location with optional name
    const location = `${result.filepath}:${chunk.startLine}-${chunk.endLine}`;
    const nameInfo = chunk.name ? ` (${chunk.name})` : '';

    output += `${i + 1}. ${location}${nameInfo}\n`;
    output += `   Score: ${(result.score * 100).toFixed(1)}% | Type: ${chunk.type}`;

    // Add export indicator
    if (chunk.isExported) {
      output += ' | exported';
    }
    output += '\n';

    // Show preview (first 3 lines)
    const lines = chunk.content.split('\n').slice(0, 3);
    for (const line of lines) {
      const trimmedLine = line.substring(0, 80);
      output += `      ${trimmedLine}${line.length > 80 ? '...' : ''}\n`;
    }

    output += '\n';
  }

  return output;
}

