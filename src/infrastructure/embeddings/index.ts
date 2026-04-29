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

/**
 * Optional Xenova runtime: import {@link XenovaTransformersEmbeddingProvider} from
 * `./xenovaEmbeddingProvider` only if you need it. Re-exporting it from this barrel
 * would load `@xenova/transformers` for every CLI/SDK user and duplicate native
 * `sharp`/libvips with the Hugging Face stack (crash on macOS).
 */

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
