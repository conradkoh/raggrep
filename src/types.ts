/**
 * Type definitions for the RAG system
 *
 * This file re-exports domain entities and defines module interfaces.
 * For new code, prefer importing directly from 'domain/entities'.
 */

// Re-export all domain entities for backwards compatibility
export type {
  Chunk,
  ChunkType,
  FileIndex,
  FileManifestEntry,
  ModuleManifest,
  GlobalManifest,
  FileSummary,
  Tier1Manifest,
  SearchResult,
  SearchOptions,
  SearchContributions,
  CoreContribution,
  LanguageContribution,
  IntrospectionContribution,
  Config,
  ModuleConfig,
} from "./domain/entities";

export {
  createChunkId,
  DEFAULT_SEARCH_OPTIONS,
  DEFAULT_IGNORE_PATHS,
  DEFAULT_EXTENSIONS,
  createDefaultConfig,
} from "./domain/entities";

// ============================================================================
// Module System Interfaces
// ============================================================================

import type {
  Config,
  FileIndex,
  SearchResult,
  SearchOptions,
  ModuleConfig,
} from "./domain/entities";

/**
 * Context provided to modules during indexing
 */
import type { FileIntrospection } from "./domain/entities/introspection";

export interface IndexContext {
  rootDir: string;
  config: Config;
  /** Get the content of a file */
  readFile: (filepath: string) => Promise<string>;
  /** Get file stats */
  getFileStats: (filepath: string) => Promise<{ lastModified: string }>;
  /** Get introspection data for a file (if available) */
  getIntrospection?: (filepath: string) => FileIntrospection | undefined;
}

/**
 * Context provided to modules during search
 */
export interface SearchContext {
  rootDir: string;
  config: Config;
  /** Load index data for a specific file */
  loadFileIndex: (filepath: string) => Promise<FileIndex | null>;
  /** List all indexed files */
  listIndexedFiles: () => Promise<string[]>;
}

/**
 * Base interface for index modules
 *
 * Modules provide different strategies for indexing and retrieving code.
 * Examples:
 * - SemanticModule: Uses text embeddings for natural language search
 * - SymbolModule: Uses TypeScript/LSP symbol information
 * - ASTModule: Uses AST-based code structure analysis
 */
export interface IndexModule {
  /** Unique identifier for this module */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of what this module indexes */
  readonly description: string;

  /** Version of the module (for index compatibility) */
  readonly version: string;

  /**
   * Index a single file
   * @returns FileIndex with module-specific data, or null if file should be skipped
   */
  indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null>;

  /**
   * Search the index with a query
   * @returns Ranked search results
   */
  search(
    query: string,
    ctx: SearchContext,
    options?: SearchOptions
  ): Promise<SearchResult[]>;

  /**
   * Optional: Initialize the module (e.g., load models, connect to services)
   */
  initialize?(config: ModuleConfig): Promise<void>;

  /**
   * Optional: Called after all files have been indexed.
   * Use for building secondary indexes (e.g., Tier 1 summaries, BM25 index).
   */
  finalize?(ctx: IndexContext): Promise<void>;

  /**
   * Optional: Cleanup resources
   */
  dispose?(): Promise<void>;
}

/**
 * Registry for managing available modules
 */
export interface ModuleRegistry {
  register(module: IndexModule): void;
  get(id: string): IndexModule | undefined;
  list(): IndexModule[];
  getEnabled(config: Config): IndexModule[];
}
