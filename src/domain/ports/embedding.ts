/**
 * Embedding Port
 *
 * Abstract interface for embedding generation.
 * This allows the domain to remain independent of the actual embedding implementation
 * (e.g., Transformers.js, OpenAI API, local models).
 */

import type { Logger } from "./logger";

/**
 * Available embedding model names
 */
export type EmbeddingModelName =
  | "all-MiniLM-L6-v2"
  | "all-MiniLM-L12-v2"
  | "bge-small-en-v1.5"
  | "paraphrase-MiniLM-L3-v2";

/**
 * Configuration for embedding provider
 */
export interface EmbeddingConfig {
  /** Model name to use */
  model: EmbeddingModelName;
  /** Whether to show progress during model loading (deprecated, use logger instead) */
  showProgress?: boolean;
  /** Logger for reporting download progress */
  logger?: Logger;
}

/**
 * Abstract embedding provider interface.
 *
 * Implementations might use:
 * - Local models (Transformers.js)
 * - Remote APIs (OpenAI, Cohere)
 * - Custom models
 */
export interface EmbeddingProvider {
  /**
   * Generate embedding for a single text
   * @returns Embedding vector (typically 384 dimensions for MiniLM)
   */
  getEmbedding(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batched for efficiency)
   * @returns Array of embedding vectors
   */
  getEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimension of embeddings produced by this provider
   */
  getDimension(): number;

  /**
   * Get the current model name
   */
  getModelName(): string;

  /**
   * Initialize the provider (e.g., load model)
   */
  initialize?(config: EmbeddingConfig): Promise<void>;

  /**
   * Cleanup resources
   */
  dispose?(): Promise<void>;
}

// Note: cosineSimilarity has moved to domain/services/similarity.ts
