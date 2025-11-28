/**
 * Configuration Loader
 *
 * Infrastructure adapter for loading and saving RAGgrep configuration.
 * Handles file I/O operations for configuration management.
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as crypto from "crypto";
import type { Config, ModuleConfig } from "../../domain/entities";
import { createDefaultConfig } from "../../domain/entities";
import type { EmbeddingConfig, EmbeddingModelName } from "../../domain/ports";

// ============================================================================
// Constants
// ============================================================================

/** Default configuration instance */
export const DEFAULT_CONFIG: Config = createDefaultConfig();

/** Base directory for raggrep temp indexes */
const RAGGREP_TEMP_BASE = path.join(os.tmpdir(), "raggrep-indexes");

/** Available embedding models (for validation) */
export const EMBEDDING_MODELS: Record<EmbeddingModelName, string> = {
  "all-MiniLM-L6-v2": "Xenova/all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2": "Xenova/all-MiniLM-L12-v2",
  "bge-small-en-v1.5": "Xenova/bge-small-en-v1.5",
  "paraphrase-MiniLM-L3-v2": "Xenova/paraphrase-MiniLM-L3-v2",
};

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
 * Index data is stored in a system temp directory to avoid cluttering
 * the user's project with index files. The temp path is derived from
 * a hash of the project's absolute path to ensure uniqueness.
 *
 * Structure: {tmpdir}/raggrep-indexes/{hash}/
 *
 * @param rootDir - Absolute path to the project root
 * @returns Absolute path to the index storage directory
 */
export function getRaggrepDir(
  rootDir: string,
  _config: Config = DEFAULT_CONFIG
): string {
  // Ensure we have an absolute path
  const absoluteRoot = path.resolve(rootDir);

  // Generate a unique hash for this project
  const projectHash = hashPath(absoluteRoot);

  // Return the temp directory path
  return path.join(RAGGREP_TEMP_BASE, projectHash);
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
    indexDir: path.join(RAGGREP_TEMP_BASE, projectHash),
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
 * Get the config file path.
 * Note: Config is still stored in the temp index directory, not the project.
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
  const modelName = (options.embeddingModel as string) || "all-MiniLM-L6-v2";

  // Validate model name
  if (!(modelName in EMBEDDING_MODELS)) {
    console.warn(
      `Unknown embedding model: ${modelName}, falling back to all-MiniLM-L6-v2`
    );
    return { model: "all-MiniLM-L6-v2" };
  }

  return {
    model: modelName as EmbeddingModelName,
    // Default to NO progress logs unless explicitly enabled
    showProgress: options.showProgress === true,
  };
}
