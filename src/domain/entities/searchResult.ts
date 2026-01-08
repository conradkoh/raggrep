/**
 * SearchResult Entity
 *
 * Represents a single result from a search query.
 */

import type { Chunk } from "./chunk";

/**
 * Contribution from the core index.
 */
export interface CoreContribution {
  /** Symbol name match score (0-1) */
  symbolMatch: number;
  /** BM25 keyword match score (0-1) */
  keywordMatch: number;
}

/**
 * Contribution from a language-specific index.
 */
export interface LanguageContribution {
  /** Semantic embedding similarity (0-1) */
  semanticMatch: number;
  /** BM25 keyword match score (0-1) */
  keywordMatch: number;
}

/**
 * Contribution from introspection boosting.
 */
export interface IntrospectionContribution {
  /** Boost from domain match */
  domainBoost: number;
  /** Boost from layer match */
  layerBoost: number;
  /** Boost from scope match */
  scopeBoost: number;
  /** Boost from path segment match */
  pathBoost: number;
}

/**
 * Tracks which indexes contributed to a search result's score.
 * Used for learning and tuning.
 */
export interface SearchContributions {
  /** Core index contribution */
  core?: CoreContribution;
  /** Language-specific index contribution (keyed by module ID) */
  language?: Record<string, LanguageContribution>;
  /** Introspection boost contribution */
  introspection?: IntrospectionContribution;
}

/**
 * A search result with relevance score and source information.
 */
export interface SearchResult {
  /** Path to the file containing the result */
  filepath: string;

  /** The matching chunk */
  chunk: Chunk;

  /** Final relevance score (0-1, higher is better) */
  score: number;

  /** ID of the module that produced this result */
  moduleId: string;

  /** Contribution tracking for learning */
  contributions?: SearchContributions;

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

  /**
   * Filter results by path prefix or glob pattern.
   *
   * Supports two modes:
   * - Path prefix: 'src/auth' matches all files in src/auth/
   * - Glob pattern: '*.ts' matches all TypeScript files, '*.md' matches markdown
   *
   * Examples:
   * - ['src/auth'] - files in src/auth/
   * - ['*.ts'] - all TypeScript files
   * - ['*.md'] - all Markdown files
   * - ['src/**\/*.test.ts'] - test files in src/
   */
  pathFilter?: string[];

  /**
   * Ensure the index is fresh before searching (default: true).
   *
   * When true, the search will automatically:
   * - Create the index if it doesn't exist
   * - Re-index any modified files
   * - Remove entries for deleted files
   *
   * Set to false if you've already ensured freshness or want explicit control.
   */
  ensureFresh?: boolean;
}

/**
 * Default search options.
 */
export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  topK: 10,
  minScore: 0.15,
  filePatterns: [],
  pathFilter: [],
  ensureFresh: true,
};

// ============================================================================
// Exact Match Results (Literal Search Track)
// ============================================================================

/**
 * A single exact match occurrence in a file.
 * Represents a grep-like match with surrounding context.
 */
export interface ExactMatchOccurrence {
  /** Line number where the match was found (1-indexed) */
  line: number;

  /** Column where the match starts (0-indexed) */
  column: number;

  /** The full line containing the match */
  lineContent: string;

  /** Line before the match (if available) */
  contextBefore?: string;

  /** Line after the match (if available) */
  contextAfter?: string;
}

/**
 * Exact matches found in a single file.
 */
export interface ExactMatchFile {
  /** Path to the file */
  filepath: string;

  /** All occurrences of the literal in this file */
  occurrences: ExactMatchOccurrence[];

  /** Total number of matches in this file */
  matchCount: number;
}

/**
 * Result of exact/literal search across the codebase.
 * This is separate from semantic search results.
 */
export interface ExactMatchResults {
  /** The literal that was searched for */
  query: string;

  /** Files containing exact matches, sorted by match count */
  files: ExactMatchFile[];

  /** Total number of matches across all files */
  totalMatches: number;

  /** Total number of files with matches */
  totalFiles: number;

  /** Whether results were truncated (more matches exist) */
  truncated: boolean;
}

/**
 * Combined search results with both semantic and exact match tracks.
 */
export interface HybridSearchResults {
  /** Semantic/BM25 search results (existing behavior) */
  results: SearchResult[];

  /** Exact match results for literal queries (optional) */
  exactMatches?: ExactMatchResults;

  /** Whether exact matches influenced the semantic result ranking */
  fusionApplied: boolean;
}
