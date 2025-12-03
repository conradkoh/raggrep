/**
 * Config Entity
 *
 * Configuration for RAGgrep indexing and search operations.
 */

/**
 * Configuration for a specific index module.
 */
export interface ModuleConfig {
  /** Unique module identifier */
  id: string;

  /** Whether the module is enabled */
  enabled: boolean;

  /** Module-specific options */
  options?: Record<string, unknown>;
}

/**
 * Main RAGgrep configuration.
 */
export interface Config {
  /** RAGgrep version */
  version: string;

  /** Directory name for index storage (default: '.raggrep') */
  indexDir: string;

  /** File extensions to index (e.g., ['.ts', '.tsx', '.js']) */
  extensions: string[];

  /** Paths to ignore during indexing */
  ignorePaths: string[];

  /** Enabled modules and their configurations */
  modules: ModuleConfig[];
}

/**
 * Default paths to ignore during indexing.
 */
export const DEFAULT_IGNORE_PATHS = [
  // Package managers & dependencies
  "node_modules",
  ".pnpm-store",
  ".yarn",
  "vendor",

  // Version control
  ".git",

  // Build outputs
  "dist",
  "build",
  "out",
  ".output",
  "target",

  // Framework-specific build outputs
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".vercel",
  ".netlify",

  // Caches
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".eslintcache",

  // Test & coverage
  "coverage",
  ".nyc_output",

  // Python
  "__pycache__",
  ".venv",
  "venv",
  ".pytest_cache",
  "*.egg-info",

  // IDE & editor
  ".idea",

  // RAGgrep index
  ".raggrep",
];

/**
 * Default file extensions to index.
 *
 * Note: Each module filters for its own supported extensions.
 * - language/typescript: .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts
 * - data/json: .json
 * - docs/markdown: .md
 * - core: all remaining extensions
 */
export const DEFAULT_EXTENSIONS = [
  // TypeScript/JavaScript (language/typescript module)
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  // JSON (data/json module)
  ".json",
  // Markdown (docs/markdown module)
  ".md",
  // Other languages (core module)
  ".py",
  ".go",
  ".rs",
  ".java",
  // Config & data (core module)
  ".yaml",
  ".yml",
  ".toml",
  // Database (core module)
  ".sql",
  // Other documentation (core module)
  ".txt",
];

/**
 * Create a default configuration.
 */
export function createDefaultConfig(): Config {
  return {
    version: "0.1.0",
    indexDir: ".raggrep",
    extensions: DEFAULT_EXTENSIONS,
    ignorePaths: DEFAULT_IGNORE_PATHS,
    modules: [
      {
        id: "core",
        enabled: true,
        options: {},
      },
      {
        id: "language/typescript",
        enabled: true,
        options: {
          embeddingModel: "all-MiniLM-L6-v2",
        },
      },
      {
        id: "data/json",
        enabled: true,
        options: {
          embeddingModel: "all-MiniLM-L6-v2",
        },
      },
      {
        id: "docs/markdown",
        enabled: true,
        options: {
          embeddingModel: "all-MiniLM-L6-v2",
        },
      },
    ],
  };
}
