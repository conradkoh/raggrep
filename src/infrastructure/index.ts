/**
 * Infrastructure Layer
 * 
 * Contains adapters that implement domain ports.
 * These connect the domain to external systems (filesystem, ML models, etc.)
 */

// FileSystem
export { NodeFileSystem, nodeFileSystem } from './filesystem';

// Embeddings
export { 
  TransformersEmbeddingProvider, 
  EMBEDDING_MODELS, 
  getCacheDir, 
  isModelCached 
} from './embeddings';

// Storage
export { FileIndexStorage } from './storage';

