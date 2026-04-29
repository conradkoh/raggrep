/**
 * Detect whether a Transformers.js ONNX model appears fully cached on disk.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { EmbeddingModelName } from "../../domain/ports";
import { RAGGREP_MODEL_CACHE_DIR } from "./embeddingPaths";
import { getEmbeddingModelId } from "./modelCatalog";

/**
 * Returns true when the quantized ONNX weights exist for the given logical model.
 * Both `@xenova/transformers` and `@huggingface/transformers` use the same cache layout
 * when `env.cacheDir` points at {@link RAGGREP_MODEL_CACHE_DIR}.
 */
export async function isEmbeddingModelCached(
  model: EmbeddingModelName
): Promise<boolean> {
  const modelId = getEmbeddingModelId(model);
  const onnxPath = path.join(
    RAGGREP_MODEL_CACHE_DIR,
    modelId,
    "onnx",
    "model_quantized.onnx"
  );
  try {
    await fs.access(onnxPath);
    return true;
  } catch {
    return false;
  }
}
