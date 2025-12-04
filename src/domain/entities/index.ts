/**
 * Domain Entities
 *
 * Core business objects with no external dependencies.
 * These represent the fundamental concepts in the RAGgrep domain.
 */

// Chunk - The fundamental unit of indexing
export type { Chunk, ChunkType } from "./chunk";
export { createChunkId } from "./chunk";

// FileIndex - Tier 2 full index data
export type {
  FileIndex,
  FileManifestEntry,
  ModuleManifest,
  GlobalManifest,
} from "./fileIndex";

// FileSummary - Symbolic index (lightweight summaries)
export type {
  FileSummary,
  SymbolicIndexMeta,
  Tier1Manifest,
} from "./fileSummary";

// SearchResult - Query results
export type {
  SearchResult,
  SearchOptions,
  SearchContributions,
  CoreContribution,
  LanguageContribution,
  IntrospectionContribution,
} from "./searchResult";
export { DEFAULT_SEARCH_OPTIONS } from "./searchResult";

// Config - Application configuration
export type { Config, ModuleConfig } from "./config";
export {
  DEFAULT_IGNORE_PATHS,
  DEFAULT_EXTENSIONS,
  createDefaultConfig,
} from "./config";

// Introspection - File metadata for context-aware search
export type {
  FileIntrospection,
  ProjectStructure,
  Project,
  ProjectType,
  Scope,
  IntrospectionConfig,
} from "./introspection";

// Conventions - File pattern recognition
export type {
  FileConvention,
  ConventionCategory,
  FrameworkConventions,
  ConventionMatch,
} from "./conventions";

// Literal - Types for literal boosting
export type {
  LiteralType,
  LiteralMatchType,
  LiteralConfidence,
  LiteralDetectionMethod,
  ExtractedLiteral,
  DetectedLiteral,
  QueryLiteralParseResult,
  LiteralMatch,
  LiteralIndexEntry,
  LiteralIndexData,
} from "./literal";
export { LITERAL_SCORING } from "./literal";
