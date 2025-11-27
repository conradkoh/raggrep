/**
 * Domain Entities
 * 
 * Core business objects with no external dependencies.
 * These represent the fundamental concepts in the RAGgrep domain.
 */

// Chunk - The fundamental unit of indexing
export type { Chunk, ChunkType } from './chunk';
export { createChunkId } from './chunk';

// FileIndex - Tier 2 full index data
export type { FileIndex, FileManifestEntry, ModuleManifest, GlobalManifest } from './fileIndex';

// FileSummary - Tier 1 lightweight summaries
export type { FileSummary, Tier1Manifest } from './fileSummary';

// SearchResult - Query results
export type { SearchResult, SearchOptions } from './searchResult';
export { DEFAULT_SEARCH_OPTIONS } from './searchResult';

// Config - Application configuration
export type { Config, ModuleConfig } from './config';
export { 
  DEFAULT_IGNORE_PATHS, 
  DEFAULT_EXTENSIONS, 
  createDefaultConfig 
} from './config';

