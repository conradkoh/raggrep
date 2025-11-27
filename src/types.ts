// Type definitions for the RAG system

// ============================================================================
// Core Data Types
// ============================================================================

/**
 * Types of code chunks that can be extracted
 */
export type ChunkType = 
  | 'function' 
  | 'class' 
  | 'interface' 
  | 'type' 
  | 'enum'
  | 'variable'
  | 'block' 
  | 'file';

/**
 * Represents a chunk of code or text that has been indexed
 */
export interface Chunk {
  /** Unique identifier for this chunk */
  id: string;
  /** The source code content */
  content: string;
  /** 1-based start line number */
  startLine: number;
  /** 1-based end line number */
  endLine: number;
  /** The type of code construct */
  type: ChunkType;
  /** Name of the construct (function name, class name, etc.) */
  name?: string;
  /** Whether this chunk is exported */
  isExported?: boolean;
  /** JSDoc comment if present */
  jsDoc?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Indexed data for a single file, produced by a specific module
 */
export interface FileIndex {
  filepath: string;
  lastModified: string;
  chunks: Chunk[];
  /** Module-specific indexed data (e.g., embeddings, symbol tables, etc.) */
  moduleData: Record<string, unknown>;
  references?: string[];
}

/**
 * Manifest tracking all indexed files for a specific module
 */
export interface ModuleManifest {
  moduleId: string;
  version: string;
  lastUpdated: string;
  files: { [filepath: string]: { lastModified: string; chunkCount: number } };
}

/**
 * Global manifest tracking all active modules
 */
export interface GlobalManifest {
  version: string;
  lastUpdated: string;
  modules: string[];
}

/**
 * A search result with score and source information
 */
export interface SearchResult {
  filepath: string;
  chunk: Chunk;
  score: number;
  moduleId: string;
  /** Additional context from the module */
  context?: Record<string, unknown>;
}

// ============================================================================
// Configuration
// ============================================================================

export interface Config {
  version: string;
  indexDir: string;
  extensions: string[];
  ignorePaths: string[];
  modules: ModuleConfig[];
}

export interface ModuleConfig {
  id: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

// ============================================================================
// Module System Interfaces
// ============================================================================

/**
 * Context provided to modules during indexing
 */
export interface IndexContext {
  rootDir: string;
  config: Config;
  /** Get the content of a file */
  readFile: (filepath: string) => Promise<string>;
  /** Get file stats */
  getFileStats: (filepath: string) => Promise<{ lastModified: string }>;
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
 * Options for search operations
 */
export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  topK?: number;
  /** Minimum similarity score threshold 0-1 (default: 0.15). Lower values return more results. */
  minScore?: number;
  /** Filter to specific file patterns */
  filePatterns?: string[];
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
  indexFile(filepath: string, content: string, ctx: IndexContext): Promise<FileIndex | null>;
  
  /**
   * Search the index with a query
   * @returns Ranked search results
   */
  search(query: string, ctx: SearchContext, options?: SearchOptions): Promise<SearchResult[]>;
  
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
