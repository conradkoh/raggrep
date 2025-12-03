/**
 * RAGgrep - Local filesystem-based RAG system for codebases
 *
 * Provides semantic search over code using local embeddings.
 *
 * @example
 * ```ts
 * import raggrep from 'raggrep';
 *
 * // Index a directory (automatically cleans up deleted files)
 * await raggrep.index('/path/to/project');
 *
 * // Search the index
 * const results = await raggrep.search('/path/to/project', 'user authentication');
 *
 * // Reset (clear) the index completely
 * await raggrep.reset('/path/to/project');
 * ```
 *
 * @example With custom logger
 * ```ts
 * import raggrep, { createLogger, createInlineLogger } from 'raggrep';
 *
 * // Create a logger (defaults to console)
 * const logger = createLogger({ verbose: true });
 *
 * // Or use inline logger for CLI-style progress
 * const inlineLogger = createInlineLogger({ verbose: false });
 *
 * await raggrep.index('/path/to/project', { logger: inlineLogger });
 * ```
 */

import { indexDirectory, cleanupIndex, resetIndex } from "./app/indexer";
import type {
  IndexResult,
  IndexOptions,
  CleanupResult,
  CleanupOptions,
  ResetResult,
} from "./app/indexer";
import { search as searchIndex, formatSearchResults } from "./app/search";
import type { SearchOptions, SearchResult } from "./types";
import type { Logger, LoggerFactory } from "./domain/ports";
import {
  ConsoleLogger,
  InlineProgressLogger,
  SilentLogger,
  createLogger,
  createInlineLogger,
  createSilentLogger,
} from "./infrastructure/logger";

// Re-export types
export type {
  IndexResult,
  IndexOptions,
  CleanupResult,
  CleanupOptions,
  ResetResult,
} from "./app/indexer";
export type { SearchOptions, SearchResult, Chunk, FileIndex } from "./types";
export type { Logger, LoggerFactory } from "./domain/ports";

// Re-export logger implementations and factories
export {
  ConsoleLogger,
  InlineProgressLogger,
  SilentLogger,
  createLogger,
  createInlineLogger,
  createSilentLogger,
};

/**
 * Index a directory for semantic search.
 *
 * Creates a `.raggrep/` folder with the index data.
 * Automatically cleans up stale entries for deleted files.
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
 * Note: Cleanup is now automatic during indexing. This function is provided
 * for explicit cleanup without re-indexing.
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
  options: CleanupOptions = {}
): Promise<CleanupResult[]> {
  return cleanupIndex(directory, options);
}

/**
 * Reset (completely clear) the index for a directory.
 *
 * @param directory - Path to the indexed directory
 * @returns Result with success status and removed index path
 * @throws Error if no index exists for the directory
 *
 * @example
 * ```ts
 * try {
 *   const result = await raggrep.reset('./my-project');
 *   console.log(`Cleared index at: ${result.indexDir}`);
 * } catch (error) {
 *   console.error('No index found');
 * }
 * ```
 */
export async function reset(directory: string): Promise<ResetResult> {
  return resetIndex(directory);
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
  reset,
  formatSearchResults,
};

export default raggrep;
