/**
 * Factory for {@link EmbeddingProvider} implementations (composition root helper).
 */

import type {
  EmbeddingConfig,
  EmbeddingProvider,
  EmbeddingRuntime,
} from "../../domain/ports";
import { HuggingFaceTransformersEmbeddingProvider } from "./huggingfaceEmbeddingProvider";

function resolveRuntime(config: EmbeddingConfig): EmbeddingRuntime {
  return config.runtime ?? "huggingface";
}

/**
 * Instantiate the embedding adapter matching {@link EmbeddingConfig.runtime}.
 * Defaults to `@huggingface/transformers` when `runtime` is omitted.
 *
 * `@xenova/transformers` is loaded only when {@link EmbeddingConfig.runtime}
 * is `"xenova"`. Loading both Xenova and Hugging Face stacks in one process
 * pulls two different native `sharp`/libvips builds and can crash on macOS
 * (duplicate Objective‑C classes, malloc errors after shutdown).
 */
export async function createEmbeddingProvider(
  config: EmbeddingConfig
): Promise<EmbeddingProvider> {
  const runtime = resolveRuntime(config);
  if (runtime === "huggingface") {
    return new HuggingFaceTransformersEmbeddingProvider(config);
  }
  const { XenovaTransformersEmbeddingProvider } = await import(
    "./xenovaEmbeddingProvider.js"
  );
  return new XenovaTransformersEmbeddingProvider(config);
}
