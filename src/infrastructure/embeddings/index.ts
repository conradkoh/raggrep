/**
 * Embedding Infrastructure
 *
 * Local ONNX embedding adapters plus a global facade for module convenience.
 */

export {
  EMBEDDING_MODEL_IDS,
  EMBEDDING_MODELS,
  ALL_EMBEDDING_MODEL_NAMES,
  BENCHMARK_MODEL_NAMES,
  EMBEDDING_DIMENSIONS,
  getEmbeddingModelId,
  getEmbeddingDimension,
} from "./modelCatalog";

export { RAGGREP_MODEL_CACHE_DIR } from "./embeddingPaths";

export { XenovaTransformersEmbeddingProvider } from "./xenovaEmbeddingProvider";
/** @deprecated Use {@link XenovaTransformersEmbeddingProvider} */
export { TransformersEmbeddingProvider } from "./xenovaEmbeddingProvider";

export { HuggingFaceTransformersEmbeddingProvider } from "./huggingfaceEmbeddingProvider";

export { createEmbeddingProvider } from "./embeddingProviderFactory";

export {
  configureEmbeddings,
  getEmbeddingConfig,
  getEmbedding,
  getEmbeddings,
  getCacheDir,
  isModelCached,
  resetGlobalEmbeddingProvider,
} from "./globalEmbeddings";
