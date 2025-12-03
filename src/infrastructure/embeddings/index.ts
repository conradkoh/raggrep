/**
 * Embedding Infrastructure
 *
 * Provides embedding generation using Transformers.js.
 */

export {
  // Class-based API
  TransformersEmbeddingProvider,
  // Constants
  EMBEDDING_MODELS,
  EMBEDDING_DIMENSIONS,
  // Utilities
  getCacheDir,
  isModelCached,
  // Global API (convenience functions)
  configureEmbeddings,
  getEmbeddingConfig,
  getEmbedding,
  getEmbeddings,
} from "./transformersEmbedding";

