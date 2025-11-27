/**
 * RAGgrep - Local filesystem-based RAG system for codebases
 * 
 * Provides semantic search over code using local embeddings.
 * 
 * @example
 * ```ts
 * import raggrep from 'raggrep';
 * 
 * // Index a directory
 * await raggrep.index('/path/to/project');
 * 
 * // Search the index
 * const results = await raggrep.search('/path/to/project', 'user authentication');
 * 
 * // Clean up stale entries
 * await raggrep.cleanup('/path/to/project');
 * ```
 */

import { indexDirectory, cleanupIndex } from './indexer';
import type { IndexResult, IndexOptions, CleanupResult } from './indexer';
import { search as searchIndex, formatSearchResults } from './search';
import type { SearchOptions, SearchResult } from './types';

// Re-export types
export type { IndexResult, IndexOptions, CleanupResult } from './indexer';
export type { SearchOptions, SearchResult, Chunk, FileIndex } from './types';

/**
 * Index a directory for semantic search.
 * 
 * Creates a `.raggrep/` folder with the index data.
 * 
 * @param directory - Path to the directory to index
 * @param options - Index options
 * @returns Array of results per module
 * 
 * @example
 * ```ts
 * // Basic indexing
 * await raggrep.index('./my-project');
 * 
 * // With options
 * await raggrep.index('./my-project', {
 *   model: 'bge-small-en-v1.5',
 *   verbose: true
 * });
 * ```
 */
export async function index(
  directory: string, 
  options: IndexOptions = {}
): Promise<IndexResult[]> {
  return indexDirectory(directory, options);
}

/**
 * Search the indexed codebase.
 * 
 * @param directory - Path to the indexed directory
 * @param query - Natural language search query
 * @param options - Search options
 * @returns Array of search results sorted by relevance
 * 
 * @example
 * ```ts
 * // Basic search
 * const results = await raggrep.search('./my-project', 'user login');
 * 
 * // With options
 * const results = await raggrep.search('./my-project', 'database query', {
 *   topK: 5,
 *   minScore: 0.2,
 *   filePatterns: ['*.ts']
 * });
 * ```
 */
export async function search(
  directory: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  return searchIndex(directory, query, options);
}

/**
 * Clean up stale index entries for files that no longer exist.
 * 
 * @param directory - Path to the indexed directory
 * @param options - Cleanup options
 * @returns Array of cleanup results per module
 * 
 * @example
 * ```ts
 * const results = await raggrep.cleanup('./my-project');
 * console.log(`Removed ${results[0].removed} stale entries`);
 * ```
 */
export async function cleanup(
  directory: string,
  options: { verbose?: boolean } = {}
): Promise<CleanupResult[]> {
  return cleanupIndex(directory, options);
}

/**
 * Format search results for display.
 * 
 * @param results - Array of search results
 * @returns Formatted string for console output
 */
export { formatSearchResults };

// Default export for convenient importing
const raggrep = {
  index,
  search,
  cleanup,
  formatSearchResults,
};

export default raggrep;

