/**
 * Configuration Loader
 *
 * Infrastructure adapter for loading and saving RAGgrep configuration.
 * Handles file I/O operations for configuration management.
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as crypto from "crypto";
import type { Config, ModuleConfig } from "../../domain/entities";
import { createDefaultConfig } from "../../domain/entities";
import type {
  EmbeddingConfig,
  EmbeddingModelName,
  EmbeddingRuntime,
} from "../../domain/ports";
import { EMBEDDING_MODELS } from "../embeddings/modelCatalog";

export { EMBEDDING_MODELS };

// ============================================================================
// Constants
// ============================================================================

/** Default configuration instance */
export const DEFAULT_CONFIG: Config = createDefaultConfig();

/** Directory name for index data under the project (or CLI cwd) root */
export const RAGGREP_INDEX_DIR = ".raggrep";

// ============================================================================
// Path Utilities (pure functions)
// ============================================================================

/**
 * Generate a short hash of a string for use in directory names.
 * Uses first 12 characters of SHA256 hash.
 */
function hashPath(inputPath: string): string {
  return crypto
    .createHash("sha256")
    .update(inputPath)
    .digest("hex")
    .slice(0, 12);
}

/**
 * Get the index storage directory path.
 *
 * Index data is stored under `{rootDir}/.raggrep/`, where `rootDir` is the
 * directory being indexed (for the CLI this is the current working directory).
 *
 * @param rootDir - Absolute or resolved path to the project root
 * @returns Absolute path to the index storage directory
 */
export function getRaggrepDir(
  rootDir: string,
  _config: Config = DEFAULT_CONFIG
): string {
  const absoluteRoot = path.resolve(rootDir);
  return path.join(absoluteRoot, RAGGREP_INDEX_DIR);
}

/**
 * Get the index storage path and also return useful metadata.
 * Helpful for debugging and user feedback.
 */
export function getIndexLocation(rootDir: string): {
  indexDir: string;
  projectRoot: string;
  projectHash: string;
} {
  const absoluteRoot = path.resolve(rootDir);
  const projectHash = hashPath(absoluteRoot);

  return {
    indexDir: path.join(absoluteRoot, RAGGREP_INDEX_DIR),
    projectRoot: absoluteRoot,
    projectHash,
  };
}

/**
 * Get the index data directory for a specific module
 */
export function getModuleIndexPath(
  rootDir: string,
  moduleId: string,
  config: Config = DEFAULT_CONFIG
): string {
  const indexDir = getRaggrepDir(rootDir, config);
  return path.join(indexDir, "index", moduleId);
}

/**
 * Get the manifest path for a specific module
 */
export function getModuleManifestPath(
  rootDir: string,
  moduleId: string,
  config: Config = DEFAULT_CONFIG
): string {
  const indexDir = getRaggrepDir(rootDir, config);
  return path.join(indexDir, "index", moduleId, "manifest.json");
}

/**
 * Get the global manifest path
 */
export function getGlobalManifestPath(
  rootDir: string,
  config: Config = DEFAULT_CONFIG
): string {
  const indexDir = getRaggrepDir(rootDir, config);
  return path.join(indexDir, "manifest.json");
}

/**
 * Get the config file path (inside `.raggrep` under the project root).
 */
export function getConfigPath(
  rootDir: string,
  config: Config = DEFAULT_CONFIG
): string {
  const indexDir = getRaggrepDir(rootDir, config);
  return path.join(indexDir, "config.json");
}

// ============================================================================
// Config I/O (infrastructure)
// ============================================================================

/**
 * Load config from file or return default
 */
export async function loadConfig(rootDir: string): Promise<Config> {
  const configPath = getConfigPath(rootDir, DEFAULT_CONFIG);

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const savedConfig = JSON.parse(content) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...savedConfig };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Save config to file
 */
export async function saveConfig(
  rootDir: string,
  config: Config
): Promise<void> {
  const configPath = getConfigPath(rootDir, config);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// ============================================================================
// Config Utilities (pure functions)
// ============================================================================

/**
 * Get module config by ID
 */
export function getModuleConfig(
  config: Config,
  moduleId: string
): ModuleConfig | undefined {
  return config.modules.find((m) => m.id === moduleId);
}

/**
 * Extract embedding config from module options
 */
export function getEmbeddingConfigFromModule(
  moduleConfig: ModuleConfig
): EmbeddingConfig {
  const options = moduleConfig.options || {};
  const modelName = (options.embeddingModel as string) || "bge-small-en-v1.5";

  // Validate model name
  if (!(modelName in EMBEDDING_MODELS)) {
    console.warn(
      `Unknown embedding model: ${modelName}, falling back to bge-small-en-v1.5`
    );
    return { model: "bge-small-en-v1.5" };
  }

  const rt = options.embeddingRuntime as string | undefined;
  let runtime: EmbeddingRuntime | undefined;
  if (rt === "xenova" || rt === "huggingface") {
    runtime = rt;
  } else if (rt !== undefined) {
    console.warn(
      `Unknown embeddingRuntime: ${rt}, falling back to default (xenova)`
    );
  }

  return {
    model: modelName as EmbeddingModelName,
    ...(runtime ? { runtime } : {}),
    // Default to NO progress logs unless explicitly enabled
    showProgress: options.showProgress === true,
  };
}
