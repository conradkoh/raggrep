// Local embedding provider using Transformers.js
// Models are automatically downloaded and cached on first use

import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Configuration
// ============================================================================

// Configure cache directory for models
// Uses ~/.cache/raggrep/models by default
const CACHE_DIR = path.join(os.homedir(), '.cache', 'raggrep', 'models');

// Set the cache directory for transformers.js
env.cacheDir = CACHE_DIR;

// Disable local model check (always try to use cache first, then download)
env.allowLocalModels = true;

// Available embedding models (smaller = faster, larger = better quality)
export const EMBEDDING_MODELS = {
  // Default: Good balance of speed and quality (~33M params, 384 dimensions)
  'all-MiniLM-L6-v2': 'Xenova/all-MiniLM-L6-v2',
  
  // Higher quality, slightly slower (~33M params, 384 dimensions)
  'all-MiniLM-L12-v2': 'Xenova/all-MiniLM-L12-v2',
  
  // BGE small - good for code (~33M params, 384 dimensions)
  'bge-small-en-v1.5': 'Xenova/bge-small-en-v1.5',
  
  // Even smaller/faster option (~22M params, 384 dimensions)
  'paraphrase-MiniLM-L3-v2': 'Xenova/paraphrase-MiniLM-L3-v2',
} as const;

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

// ============================================================================
// Embedding Provider
// ============================================================================

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let currentModelName: string | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

export interface EmbeddingConfig {
  model: EmbeddingModelName;
  /** Show progress during model download */
  showProgress?: boolean;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: 'all-MiniLM-L6-v2',
  showProgress: true,
};

let currentConfig: EmbeddingConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the embedding model
 */
export function configureEmbeddings(config: Partial<EmbeddingConfig>): void {
  const newConfig = { ...currentConfig, ...config };
  
  // If model changed, reset pipeline
  if (newConfig.model !== currentConfig.model) {
    embeddingPipeline = null;
    currentModelName = null;
  }
  
  currentConfig = newConfig;
}

/**
 * Initialize the embedding pipeline (downloads model if needed)
 */
async function initializePipeline(): Promise<void> {
  if (embeddingPipeline && currentModelName === currentConfig.model) {
    return;
  }
  
  // Prevent multiple simultaneous initializations
  if (isInitializing && initPromise) {
    return initPromise;
  }
  
  isInitializing = true;
  
  initPromise = (async () => {
    const modelId = EMBEDDING_MODELS[currentConfig.model];
    
    if (currentConfig.showProgress) {
      console.log(`\n  Loading embedding model: ${currentConfig.model}`);
      console.log(`  Cache: ${CACHE_DIR}`);
    }
    
    try {
      // Create the feature extraction pipeline
      // This will download the model on first run
      embeddingPipeline = await pipeline('feature-extraction', modelId, {
        progress_callback: currentConfig.showProgress 
          ? (progress: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
              if (progress.status === 'progress' && progress.file) {
                const pct = progress.progress ? Math.round(progress.progress) : 0;
                process.stdout.write(`\r  Downloading ${progress.file}: ${pct}%   `);
              } else if (progress.status === 'done' && progress.file) {
                process.stdout.write(`\r  Downloaded ${progress.file}              \n`);
              } else if (progress.status === 'ready') {
                // Model is ready
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
    throw new Error('Embedding pipeline not initialized');
  }
  
  // Get embeddings using mean pooling
  const output = await embeddingPipeline(text, {
    pooling: 'mean',
    normalize: true,
  });
  
  // Convert to array
  return Array.from(output.data as Float32Array);
}

/** Maximum number of texts to process in a single batch */
const BATCH_SIZE = 32;

/**
 * Get embeddings for multiple texts (batched for efficiency)
 * 
 * Processes texts in batches of BATCH_SIZE for better performance
 * while avoiding memory issues with very large batches.
 * 
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  await initializePipeline();
  
  if (!embeddingPipeline) {
    throw new Error('Embedding pipeline not initialized');
  }
  
  const results: number[][] = [];
  
  // Process in batches for efficiency
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    // Process batch - transformers.js handles array inputs
    const outputs = await Promise.all(
      batch.map(async (text) => {
        const output = await embeddingPipeline!(text, {
          pooling: 'mean',
          normalize: true,
        });
        return Array.from(output.data as Float32Array);
      })
    );
    
    results.push(...outputs);
  }
  
  return results;
}

// ============================================================================
// Vector Math
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Get current embedding configuration
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return { ...currentConfig };
}

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  return CACHE_DIR;
}

/**
 * Check if a model is already cached
 */
export async function isModelCached(model: EmbeddingModelName = currentConfig.model): Promise<boolean> {
  const modelId = EMBEDDING_MODELS[model];
  const modelPath = path.join(CACHE_DIR, modelId.replace('/', '--'));
  
  try {
    const fs = await import('fs/promises');
    await fs.access(modelPath);
    return true;
  } catch {
    return false;
  }
}
