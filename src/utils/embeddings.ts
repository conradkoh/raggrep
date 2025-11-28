/**
 * Embedding Utilities
 *
 * This file provides a simplified global API for embeddings.
 * For new code, prefer using TransformersEmbeddingProvider from infrastructure/embeddings.
 *
 * Re-exports:
 * - cosineSimilarity from domain/services/similarity
 * - Types from domain/ports/embedding
 * - getCacheDir, isModelCached from infrastructure/embeddings
 */

import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";
import * as path from "path";
import * as os from "os";

// Re-export from proper locations
export { cosineSimilarity } from "../domain/services/similarity";
export type { EmbeddingModelName, EmbeddingConfig } from "../domain/ports";
export { getCacheDir, isModelCached, EMBEDDING_MODELS } from "../infrastructure/embeddings";

// ============================================================================
// Global Embedding Provider (legacy API)
// ============================================================================

const CACHE_DIR = path.join(os.homedir(), ".cache", "raggrep", "models");
env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;

const MODEL_IDS: Record<string, string> = {
  "all-MiniLM-L6-v2": "Xenova/all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2": "Xenova/all-MiniLM-L12-v2",
  "bge-small-en-v1.5": "Xenova/bge-small-en-v1.5",
  "paraphrase-MiniLM-L3-v2": "Xenova/paraphrase-MiniLM-L3-v2",
};

interface GlobalEmbeddingConfig {
  model: string;
  showProgress?: boolean;
}

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let currentModelName: string | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

const DEFAULT_CONFIG: GlobalEmbeddingConfig = {
  model: "all-MiniLM-L6-v2",
  showProgress: true,
};

let currentConfig: GlobalEmbeddingConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the embedding model
 */
export function configureEmbeddings(config: Partial<GlobalEmbeddingConfig>): void {
  const newConfig = { ...currentConfig, ...config };

  if (newConfig.model !== currentConfig.model) {
    embeddingPipeline = null;
    currentModelName = null;
  }

  currentConfig = newConfig;
}

/**
 * Initialize the embedding pipeline
 */
async function initializePipeline(): Promise<void> {
  if (embeddingPipeline && currentModelName === currentConfig.model) {
    return;
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;

  initPromise = (async () => {
    const modelId = MODEL_IDS[currentConfig.model] || MODEL_IDS["all-MiniLM-L6-v2"];

    if (currentConfig.showProgress) {
      console.log(`\n  Loading embedding model: ${currentConfig.model}`);
      console.log(`  Cache: ${CACHE_DIR}`);
    }

    try {
      embeddingPipeline = await pipeline("feature-extraction", modelId, {
        progress_callback: currentConfig.showProgress
          ? (progress: { status: string; file?: string; progress?: number }) => {
              if (progress.status === "progress" && progress.file) {
                const pct = progress.progress ? Math.round(progress.progress) : 0;
                process.stdout.write(`\r  Downloading ${progress.file}: ${pct}%   `);
              } else if (progress.status === "done" && progress.file) {
                process.stdout.write(`\r  Downloaded ${progress.file}              \n`);
              }
            }
          : undefined,
      });

      currentModelName = currentConfig.model;

      if (currentConfig.showProgress) {
        console.log(`  Model ready.\n`);
      }
    } catch (error) {
      embeddingPipeline = null;
      currentModelName = null;
      throw new Error(`Failed to load embedding model: ${error}`);
    } finally {
      isInitializing = false;
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Get embedding for a single text
 */
export async function getEmbedding(text: string): Promise<number[]> {
  await initializePipeline();

  if (!embeddingPipeline) {
    throw new Error("Embedding pipeline not initialized");
  }

  const output = await embeddingPipeline(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data as Float32Array);
}

const BATCH_SIZE = 32;

/**
 * Get embeddings for multiple texts (batched for efficiency)
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  await initializePipeline();

  if (!embeddingPipeline) {
    throw new Error("Embedding pipeline not initialized");
  }

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const outputs = await Promise.all(
      batch.map(async (text) => {
        const output = await embeddingPipeline!(text, {
          pooling: "mean",
          normalize: true,
        });
        return Array.from(output.data as Float32Array);
      })
    );

    results.push(...outputs);
  }

  return results;
}

/**
 * Get current embedding configuration
 */
export function getEmbeddingConfig(): GlobalEmbeddingConfig {
  return { ...currentConfig };
}
