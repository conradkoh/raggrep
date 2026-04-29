/**
 * Process-wide embedding facade (global provider + convenience functions).
 *
 * Modules call {@link configureEmbeddings} before embedding I/O; the active
 * {@link EmbeddingProvider} is chosen via {@link createEmbeddingProvider}.
 */

import type { EmbeddingConfig, EmbeddingProvider } from "../../domain/ports";
import { RAGGREP_MODEL_CACHE_DIR } from "./embeddingPaths";
import { createEmbeddingProvider } from "./embeddingProviderFactory";

let globalProvider: EmbeddingProvider | null = null;

let globalConfig: EmbeddingConfig = {
  model: "bge-small-en-v1.5",
  runtime: "huggingface",
  showProgress: false,
  logger: undefined,
};

/**
 * Configure the global embedding provider. Resets the underlying adapter when
 * model, runtime, or logger reference changes.
 */
export function configureEmbeddings(config: Partial<EmbeddingConfig>): void {
  const merged: EmbeddingConfig = {
    ...globalConfig,
    ...config,
  };
  if (merged.runtime === undefined) {
    merged.runtime = "huggingface";
  }

  const needsReset =
    merged.model !== globalConfig.model ||
    merged.runtime !== globalConfig.runtime ||
    merged.logger !== globalConfig.logger;

  if (needsReset) {
    const prev = globalProvider;
    globalProvider = null;
    void prev?.dispose?.();
  }

  globalConfig = merged;
}

/**
 * Current global embedding configuration (shallow copy).
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return { ...globalConfig };
}

async function ensureGlobalProvider(): Promise<EmbeddingProvider> {
  if (!globalProvider) {
    globalProvider = await createEmbeddingProvider(globalConfig);
    await globalProvider.initialize?.(globalConfig);
  }
  return globalProvider;
}

/**
 * Drop the global provider so the next call loads a fresh adapter.
 * Intended for benchmarks and tests.
 */
export async function resetGlobalEmbeddingProvider(): Promise<void> {
  const prev = globalProvider;
  globalProvider = null;
  await prev?.dispose?.();
}

export async function getEmbedding(text: string): Promise<number[]> {
  const provider = await ensureGlobalProvider();
  return provider.getEmbedding(text);
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const provider = await ensureGlobalProvider();
  return provider.getEmbeddings(texts);
}

/**
 * Model cache directory on disk (shared by all runtimes when configured this way).
 */
export function getCacheDir(): string {
  return RAGGREP_MODEL_CACHE_DIR;
}

export { isEmbeddingModelCached as isModelCached } from "./modelCache";
