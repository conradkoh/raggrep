/**
 * SearchResult Entity
 * 
 * Represents a single result from a search query.
 */

import type { Chunk } from './chunk';

/**
 * A search result with relevance score and source information.
 */
export interface SearchResult {
  /** Path to the file containing the result */
  filepath: string;
  
  /** The matching chunk */
  chunk: Chunk;
  
  /** Relevance score (0-1, higher is better) */
  score: number;
  
  /** ID of the module that produced this result */
  moduleId: string;
  
  /** Additional context from the search (e.g., semantic vs keyword scores) */
  context?: Record<string, unknown>;
}

/**
 * Options for search operations.
 */
export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  topK?: number;
  
  /** Minimum similarity score threshold 0-1 (default: 0.15) */
  minScore?: number;
  
  /** Filter to specific file patterns (e.g., ['*.ts', '*.tsx']) */
  filePatterns?: string[];
}

/**
 * Default search options.
 */
export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  topK: 10,
  minScore: 0.15,
  filePatterns: [],
};

