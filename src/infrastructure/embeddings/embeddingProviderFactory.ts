/**
 * Factory for {@link EmbeddingProvider} implementations (composition root helper).
 */

import type {
  EmbeddingConfig,
  EmbeddingProvider,
  EmbeddingRuntime,
} from "../../domain/ports";
import { HuggingFaceTransformersEmbeddingProvider } from "./huggingfaceEmbeddingProvider";
import { XenovaTransformersEmbeddingProvider } from "./xenovaEmbeddingProvider";

function resolveRuntime(config: EmbeddingConfig): EmbeddingRuntime {
  return config.runtime ?? "xenova";
}

/**
 * Instantiate the embedding adapter matching {@link EmbeddingConfig.runtime}.
 * Defaults to `@xenova/transformers` when `runtime` is omitted.
 */
export function createEmbeddingProvider(
  config: EmbeddingConfig
): EmbeddingProvider {
  const runtime = resolveRuntime(config);
  if (runtime === "huggingface") {
    return new HuggingFaceTransformersEmbeddingProvider(config);
  }
  return new XenovaTransformersEmbeddingProvider(config);
}
