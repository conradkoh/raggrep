/**
 * Canonical mapping of logical embedding model names to Hugging Face model IDs
 * and output dimensions. Shared by all embedding adapters and config validation.
 */

import type { EmbeddingModelName } from "../../domain/ports";

/** Hugging Face hub IDs (ONNX-converted models for Transformers.js) */
export const EMBEDDING_MODEL_IDS: Record<EmbeddingModelName, string> = {
  "all-MiniLM-L6-v2": "Xenova/all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2": "Xenova/all-MiniLM-L12-v2",
  "bge-small-en-v1.5": "Xenova/bge-small-en-v1.5",
  "paraphrase-MiniLM-L3-v2": "Xenova/paraphrase-MiniLM-L3-v2",
  "nomic-embed-text-v1.5": "nomic-ai/nomic-embed-text-v1.5",
};

/** Alias for imports that expect the historical name `EMBEDDING_MODELS` */
export const EMBEDDING_MODELS = EMBEDDING_MODEL_IDS;

/** Embedding vector dimension per model */
export const EMBEDDING_DIMENSIONS: Record<EmbeddingModelName, number> = {
  "all-MiniLM-L6-v2": 384,
  "all-MiniLM-L12-v2": 384,
  "bge-small-en-v1.5": 384,
  "paraphrase-MiniLM-L3-v2": 384,
  "nomic-embed-text-v1.5": 768,
};

export function getEmbeddingModelId(model: EmbeddingModelName): string {
  return EMBEDDING_MODEL_IDS[model];
}

export function getEmbeddingDimension(model: EmbeddingModelName): number {
  return EMBEDDING_DIMENSIONS[model];
}
