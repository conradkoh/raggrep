/**
 * Domain Ports
 *
 * Interfaces defining what the domain needs from external systems.
 * These are implemented by infrastructure adapters.
 */

export type { FileSystem, FileStats } from "./filesystem";
export type {
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingModelName,
} from "./embedding";
export type { IndexStorage } from "./storage";
export type { Logger, ProgressInfo, LoggerFactory } from "./logger";

// Note: cosineSimilarity has moved to domain/services/similarity.ts
