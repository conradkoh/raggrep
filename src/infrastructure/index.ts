/**
 * Infrastructure Layer
 *
 * Contains adapters that implement domain ports.
 * These connect the domain to external systems (filesystem, ML models, etc.)
 */

// FileSystem
export { NodeFileSystem, nodeFileSystem } from "./filesystem";

// Embeddings
export {
  TransformersEmbeddingProvider,
  getCacheDir,
  isModelCached,
} from "./embeddings";

// Storage
export { FileIndexStorage, SymbolicIndex, getSymbolicPath } from "./storage";

// Config
export {
  DEFAULT_CONFIG,
  EMBEDDING_MODELS,
  getRaggrepDir,
  getModuleIndexPath,
  getModuleManifestPath,
  getGlobalManifestPath,
  getConfigPath,
  loadConfig,
  saveConfig,
  getModuleConfig,
  getEmbeddingConfigFromModule,
} from "./config";

// Logger
export {
  ConsoleLogger,
  InlineProgressLogger,
  SilentLogger,
  createLogger,
  createInlineLogger,
  createSilentLogger,
} from "./logger";
