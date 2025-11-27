/**
 * Configuration utilities
 * 
 * Provides functions for loading, saving, and managing RAGgrep configuration.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { Config, ModuleConfig } from '../domain/entities';
import { createDefaultConfig } from '../domain/entities';
import { EmbeddingConfig, EmbeddingModelName, EMBEDDING_MODELS } from './embeddings';

/** Default configuration instance */
export const DEFAULT_CONFIG: Config = createDefaultConfig();

/**
 * Get the root .raggrep directory path
 */
export function getRaggrepDir(rootDir: string, config: Config = DEFAULT_CONFIG): string {
  return path.join(rootDir, config.indexDir);
}

/**
 * Get the index data directory for a specific module
 */
export function getModuleIndexPath(rootDir: string, moduleId: string, config: Config = DEFAULT_CONFIG): string {
  return path.join(rootDir, config.indexDir, 'index', moduleId);
}

/**
 * Get the manifest path for a specific module
 */
export function getModuleManifestPath(rootDir: string, moduleId: string, config: Config = DEFAULT_CONFIG): string {
  return path.join(rootDir, config.indexDir, 'index', moduleId, 'manifest.json');
}

/**
 * Get the global manifest path
 */
export function getGlobalManifestPath(rootDir: string, config: Config = DEFAULT_CONFIG): string {
  return path.join(rootDir, config.indexDir, 'manifest.json');
}

/**
 * Get the config file path
 */
export function getConfigPath(rootDir: string, config: Config = DEFAULT_CONFIG): string {
  return path.join(rootDir, config.indexDir, 'config.json');
}

/**
 * Load config from file or return default
 */
export async function loadConfig(rootDir: string): Promise<Config> {
  const configPath = getConfigPath(rootDir, DEFAULT_CONFIG);
  
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const savedConfig = JSON.parse(content) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...savedConfig };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Save config to file
 */
export async function saveConfig(rootDir: string, config: Config): Promise<void> {
  const configPath = getConfigPath(rootDir, config);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get module config by ID
 */
export function getModuleConfig(config: Config, moduleId: string): ModuleConfig | undefined {
  return config.modules.find(m => m.id === moduleId);
}

/**
 * Extract embedding config from module options
 */
export function getEmbeddingConfigFromModule(moduleConfig: ModuleConfig): EmbeddingConfig {
  const options = moduleConfig.options || {};
  const modelName = (options.embeddingModel as string) || 'all-MiniLM-L6-v2';
  
  // Validate model name
  if (!(modelName in EMBEDDING_MODELS)) {
    console.warn(`Unknown embedding model: ${modelName}, falling back to all-MiniLM-L6-v2`);
    return { model: 'all-MiniLM-L6-v2' };
  }
  
  return {
    model: modelName as EmbeddingModelName,
    showProgress: options.showProgress !== false,
  };
}
