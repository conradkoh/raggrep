/**
 * Transformers.js Embedding Adapter
 * 
 * Implements the EmbeddingProvider port using Transformers.js for local embeddings.
 * Models are automatically downloaded and cached on first use.
 */

import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import * as path from 'path';
import * as os from 'os';
import type { EmbeddingProvider, EmbeddingConfig, EmbeddingModelName } from '../../domain/ports';

// ============================================================================
// Configuration
// ============================================================================

/** Cache directory for models */
const CACHE_DIR = path.join(os.homedir(), '.cache', 'raggrep', 'models');

// Set the cache directory for transformers.js
env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;

/** Available embedding models and their Hugging Face IDs */
export const EMBEDDING_MODELS: Record<EmbeddingModelName, string> = {
  'all-MiniLM-L6-v2': 'Xenova/all-MiniLM-L6-v2',
  'all-MiniLM-L12-v2': 'Xenova/all-MiniLM-L12-v2',
  'bge-small-en-v1.5': 'Xenova/bge-small-en-v1.5',
  'paraphrase-MiniLM-L3-v2': 'Xenova/paraphrase-MiniLM-L3-v2',
};

/** Embedding dimension for all MiniLM models */
const EMBEDDING_DIMENSION = 384;

/** Maximum texts per batch */
const BATCH_SIZE = 32;

// ============================================================================
// Transformers.js Embedding Provider
// ============================================================================

/**
 * Embedding provider using Transformers.js (local inference).
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  private pipeline: FeatureExtractionPipeline | null = null;
  private config: EmbeddingConfig;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      model: config?.model ?? 'all-MiniLM-L6-v2',
      showProgress: config?.showProgress ?? true,
    };
  }

  async initialize(config?: EmbeddingConfig): Promise<void> {
    if (config) {
      // If model changed, reset pipeline
      if (config.model !== this.config.model) {
        this.pipeline = null;
      }
      this.config = { ...this.config, ...config };
    }
    
    await this.ensurePipeline();
  }

  private async ensurePipeline(): Promise<void> {
    if (this.pipeline) {
      return;
    }
    
    // Prevent multiple simultaneous initializations
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }
    
    this.isInitializing = true;
    
    this.initPromise = (async () => {
      const modelId = EMBEDDING_MODELS[this.config.model];
      
      if (this.config.showProgress) {
        console.log(`\n  Loading embedding model: ${this.config.model}`);
        console.log(`  Cache: ${CACHE_DIR}`);
      }
      
      try {
        this.pipeline = await pipeline('feature-extraction', modelId, {
          progress_callback: this.config.showProgress 
            ? (progress: { status: string; file?: string; progress?: number }) => {
                if (progress.status === 'progress' && progress.file) {
                  const pct = progress.progress ? Math.round(progress.progress) : 0;
                  process.stdout.write(`\r  Downloading ${progress.file}: ${pct}%   `);
                } else if (progress.status === 'done' && progress.file) {
                  process.stdout.write(`\r  Downloaded ${progress.file}              \n`);
                }
              }
            : undefined,
        });
        
        if (this.config.showProgress) {
          console.log(`  Model ready.\n`);
        }
      } catch (error) {
        this.pipeline = null;
        throw new Error(`Failed to load embedding model: ${error}`);
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();
    
    return this.initPromise;
  }

  async getEmbedding(text: string): Promise<number[]> {
    await this.ensurePipeline();
    
    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }
    
    const output = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    return Array.from(output.data as Float32Array);
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    await this.ensurePipeline();
    
    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }
    
    const results: number[][] = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      
      const outputs = await Promise.all(
        batch.map(async (text) => {
          const output = await this.pipeline!(text, {
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

  getDimension(): number {
    return EMBEDDING_DIMENSION;
  }

  getModelName(): string {
    return this.config.model;
  }

  async dispose(): Promise<void> {
    this.pipeline = null;
  }
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
export async function isModelCached(model: EmbeddingModelName): Promise<boolean> {
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

