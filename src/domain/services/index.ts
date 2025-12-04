/**
 * Domain Services
 *
 * Pure algorithms and business logic with no external dependencies.
 * These services operate only on domain entities and primitive data.
 */

// BM25 keyword search
export {
  BM25Index,
  tokenize,
  normalizeScore,
  type BM25Document,
  type BM25Result,
  type BM25SerializedData,
} from "./bm25";

// Keyword extraction
export {
  extractKeywords,
  extractPathKeywords,
  parsePathContext,
  formatPathContextForEmbedding,
  COMMON_KEYWORDS,
  type PathContext,
} from "./keywords";

// Vector similarity
export { cosineSimilarity, euclideanDistance } from "./similarity";

// Query intent detection
export {
  detectQueryIntent,
  extractQueryTerms,
  calculateFileTypeBoost,
  isSourceCodeFile,
  isDocFile,
  isDataFile,
  IMPLEMENTATION_TERMS,
  DOCUMENTATION_TERMS,
  SOURCE_CODE_EXTENSIONS,
  DOC_EXTENSIONS,
  DATA_EXTENSIONS,
  type QueryIntent,
} from "./queryIntent";

// Text chunking
export {
  createLineBasedChunks,
  createSingleChunk,
  generateChunkId,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_OVERLAP,
  type TextChunk,
  type ChunkingOptions,
} from "./chunking";

// Literal boosting - Query parsing
export { parseQueryLiterals } from "./queryLiteralParser";

// Literal boosting - Code extraction
export {
  extractLiterals,
  extractLiteralsWithReferences,
} from "./literalExtractor";

// Literal boosting - Scoring
export {
  calculateLiteralMultiplier,
  calculateMaxMultiplier,
  calculateLiteralContribution,
  applyLiteralBoost,
  mergeWithLiteralBoost,
  LITERAL_SCORING_CONSTANTS,
  type LiteralScoreContribution,
  type MergeInput,
  type MergeOutput,
} from "./literalScorer";

// Structured Semantic Expansion - Query expansion with synonyms
export {
  getSynonyms,
  expandQuery,
  DEFAULT_LEXICON,
  EXPANSION_WEIGHTS,
  DEFAULT_EXPANSION_OPTIONS,
} from "./lexicon";
