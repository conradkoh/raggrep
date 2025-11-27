// Configuration utilities
import { Config, ModuleConfig } from '../types';
import { EmbeddingConfig, EmbeddingModelName, EMBEDDING_MODELS } from './embeddings';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Default paths to ignore during indexing.
 * Includes common build outputs, caches, and dependency folders.
 */
export const DEFAULT_IGNORE_PATHS = [
  // Package managers & dependencies
  'node_modules',
  '.pnpm-store',
  '.yarn',
  'vendor',        // Go vendor
  
  // Version control
  '.git',
  
  // Build outputs
  'dist',
  'build',
  'out',
  '.output',
  'target',        // Rust/Java
  
  // Framework-specific build outputs
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.vercel',
  '.netlify',
  
  // Caches
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.eslintcache',
  
  // Test & coverage
  'coverage',
  '.nyc_output',
  
  // Python
  '__pycache__',
  '.venv',
  'venv',
  '.pytest_cache',
  '*.egg-info',
  
  // IDE & editor
  '.idea',
  
  // RAGgrep index
  '.raggrep',
];

export const DEFAULT_CONFIG: Config = {
  version: '0.1.0',
  indexDir: '.raggrep',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.md'],
  ignorePaths: DEFAULT_IGNORE_PATHS,
  modules: [
    {
      id: 'semantic',
      enabled: true,
      options: {
        // Use local embedding model (auto-downloaded on first run)
        embeddingModel: 'all-MiniLM-L6-v2',
      },
    },
  ],
};

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
