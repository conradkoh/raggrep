/**
 * Shared filesystem locations for embedding model caches.
 * Used by all local ONNX embedding adapters.
 */

import * as os from "os";
import * as path from "path";

/** Hugging Face / Transformers.js model cache under the user home directory */
export const RAGGREP_MODEL_CACHE_DIR = path.join(
  os.homedir(),
  ".cache",
  "raggrep",
  "models"
);
