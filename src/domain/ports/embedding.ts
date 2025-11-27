/**
 * Embedding Port
 * 
 * Abstract interface for embedding generation.
 * This allows the domain to remain independent of the actual embedding implementation
 * (e.g., Transformers.js, OpenAI API, local models).
 */

/**
 * Available embedding model names
 */
export type EmbeddingModelName =
  | 'all-MiniLM-L6-v2'
  | 'all-MiniLM-L12-v2'
  | 'bge-small-en-v1.5'
  | 'paraphrase-MiniLM-L3-v2';

/**
 * Configuration for embedding provider
 */
export interface EmbeddingConfig {
  /** Model name to use */
  model: EmbeddingModelName;
  /** Whether to show progress during model loading */
  showProgress?: boolean;
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

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
}

