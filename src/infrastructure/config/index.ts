/**
 * Configuration Infrastructure
 *
 * Handles loading and saving RAGgrep configuration from the filesystem.
 */

export {
  // Constants
  DEFAULT_CONFIG,
  EMBEDDING_MODELS,
  // Path utilities
  getRaggrepDir,
  getIndexLocation,
  getModuleIndexPath,
  getModuleManifestPath,
  getGlobalManifestPath,
  getConfigPath,
  // I/O operations
  loadConfig,
  saveConfig,
  // Config utilities
  getModuleConfig,
  getEmbeddingConfigFromModule,
} from "./configLoader";

