/**
 * Local embedding adapter using `@huggingface/transformers` (Transformers.js v3+ line).
 */

import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import type {
  EmbeddingProvider,
  EmbeddingConfig,
  Logger,
} from "../../domain/ports";
import { RAGGREP_MODEL_CACHE_DIR } from "./embeddingPaths";
import {
  getEmbeddingDimension,
  getEmbeddingModelId,
} from "./modelCatalog";
import { isEmbeddingModelCached } from "./modelCache";

env.cacheDir = RAGGREP_MODEL_CACHE_DIR;
env.allowLocalModels = true;

const BATCH_SIZE = 32;

type ProgressPayload = {
  status: string;
  file?: string;
  progress?: number;
};

/**
 * {@link EmbeddingProvider} backed by `@huggingface/transformers`.
 */
export class HuggingFaceTransformersEmbeddingProvider
  implements EmbeddingProvider
{
  private extractor: FeatureExtractionPipeline | null = null;
  private config: EmbeddingConfig;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      model: config?.model ?? "bge-small-en-v1.5",
      runtime: config?.runtime ?? "huggingface",
      showProgress: config?.showProgress ?? false,
      logger: config?.logger,
    };
  }

  async initialize(config?: EmbeddingConfig): Promise<void> {
    if (config) {
      if (config.model !== this.config.model) {
        this.extractor = null;
      }
      this.config = { ...this.config, ...config };
    }
    await this.ensureExtractor();
  }

  private async ensureExtractor(): Promise<void> {
    if (this.extractor) {
      return;
    }
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = (async () => {
      const modelId = getEmbeddingModelId(this.config.model);
      const logger = this.config.logger;
      const showProgress = this.config.showProgress || !!logger;
      const cached = await isEmbeddingModelCached(this.config.model);
      let hasDownloads = false;

      try {
        this.extractor = await pipeline("feature-extraction", modelId, {
          progress_callback:
            showProgress && !cached
              ? (progress: ProgressPayload) => {
                  if (progress.status === "progress" && progress.file) {
                    if (!hasDownloads) {
                      hasDownloads = true;
                      if (logger) {
                        logger.info(
                          `Downloading embedding model: ${this.config.model}`
                        );
                      } else {
                        console.log(
                          `\n  Loading embedding model: ${this.config.model}`
                        );
                        console.log(`  Cache: ${RAGGREP_MODEL_CACHE_DIR}`);
                      }
                    }
                    const pct = progress.progress
                      ? Math.round(progress.progress)
                      : 0;
                    if (logger) {
                      logger.progress(
                        `  Downloading ${progress.file}: ${pct}%`
                      );
                    } else {
                      process.stdout.write(
                        `\r  Downloading ${progress.file}: ${pct}%   `
                      );
                    }
                  } else if (progress.status === "done" && progress.file) {
                    if (logger) {
                      logger.clearProgress();
                      logger.info(`  Downloaded ${progress.file}`);
                    } else if (hasDownloads) {
                      process.stdout.write(
                        `\r  Downloaded ${progress.file}              \n`
                      );
                    }
                  }
                }
              : undefined,
        });

        if (hasDownloads) {
          if (logger) {
            logger.clearProgress();
            logger.info(`Model ready: ${this.config.model}`);
          } else {
            console.log(`  Model ready.\n`);
          }
        }
      } catch (error) {
        this.extractor = null;
        if (this.config.logger) {
          this.config.logger.clearProgress();
        }
        throw new Error(`Failed to load embedding model: ${error}`);
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async getEmbedding(text: string): Promise<number[]> {
    await this.ensureExtractor();
    if (!this.extractor) {
      throw new Error("Embedding pipeline not initialized");
    }
    const output = await this.extractor(text, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data as Float32Array);
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureExtractor();
    if (!this.extractor) {
      throw new Error("Embedding pipeline not initialized");
    }

    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const outputs = await Promise.all(
        batch.map(async (text) => {
          const output = await this.extractor!(text, {
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

  getDimension(): number {
    return getEmbeddingDimension(this.config.model);
  }

  getModelName(): string {
    return this.config.model;
  }

  async dispose(): Promise<void> {
    this.extractor = null;
  }
}
