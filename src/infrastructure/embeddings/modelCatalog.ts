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

/**
 * Every {@link EmbeddingModelName}, in harness order.
 * Used when a full model list is required; benchmarks use {@link BENCHMARK_MODEL_NAMES}.
 */
export const ALL_EMBEDDING_MODEL_NAMES: readonly EmbeddingModelName[] = [
  "all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2",
  "bge-small-en-v1.5",
  "paraphrase-MiniLM-L3-v2",
  "nomic-embed-text-v1.5",
];

/**
 * Models run by `bench:embeddings` and `bench:retrieval` matrix.
 * Omits `nomic-embed-text-v1.5` for now (heavy in the local harness).
 */
export const BENCHMARK_MODEL_NAMES: readonly EmbeddingModelName[] = [
  "all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2",
  "bge-small-en-v1.5",
  "paraphrase-MiniLM-L3-v2",
];

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
