// Search module - queries across all enabled modules
import * as fs from "fs/promises";
import * as path from "path";
import {
  Config,
  SearchContext,
  SearchOptions,
  SearchResult,
  FileIndex,
  IndexModule,
  GlobalManifest,
  DEFAULT_SEARCH_OPTIONS,
} from "../../types";
import {
  loadConfig,
  getModuleIndexPath,
  getGlobalManifestPath,
  getModuleConfig,
} from "../../infrastructure/config";
import { registry, registerBuiltInModules } from "../../modules/registry";
import { ensureIndexFresh } from "../indexer";

/**
 * Search across all enabled modules
 */
export async function search(
  rootDir: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  // Ensure absolute path
  rootDir = path.resolve(rootDir);

  // Ensure index is fresh before searching (unless explicitly disabled)
  const ensureFresh = options.ensureFresh ?? DEFAULT_SEARCH_OPTIONS.ensureFresh;
  if (ensureFresh) {
    await ensureIndexFresh(rootDir, { quiet: true });
  }

  console.log(`Searching for: "${query}"`);

  // Load config
  const config = await loadConfig(rootDir);

  // Register built-in modules
  await registerBuiltInModules();

  // Check which modules have indexes
  const globalManifest = await loadGlobalManifest(rootDir, config);

  if (!globalManifest || globalManifest.modules.length === 0) {
    console.log('No index found. Run "raggrep index" first.');
    return [];
  }

  // Get modules that are both enabled and have indexes
  const modulesToSearch: IndexModule[] = [];

  for (const moduleId of globalManifest.modules) {
    const module = registry.get(moduleId);
    const moduleConfig = getModuleConfig(config, moduleId);

    if (module && moduleConfig?.enabled) {
      // Initialize module if needed
      if (module.initialize) {
        await module.initialize(moduleConfig);
      }
      modulesToSearch.push(module);
    }
  }

  if (modulesToSearch.length === 0) {
    console.log("No enabled modules with indexes found.");
    return [];
  }

  // Search with each module and aggregate results
  const allResults: SearchResult[] = [];

  for (const module of modulesToSearch) {
    const ctx = createSearchContext(rootDir, module.id, config);
    const moduleResults = await module.search(query, ctx, options);
    allResults.push(...moduleResults);
  }

  // Apply path filter if specified
  let filteredResults = allResults;
  if (options.pathFilter && options.pathFilter.length > 0) {
    const normalizedFilters = options.pathFilter.map((p) =>
      p.replace(/\\/g, "/").replace(/^\//, "").replace(/\/$/, "")
    );
    filteredResults = allResults.filter((result) => {
      const normalizedPath = result.filepath.replace(/\\/g, "/");
      return normalizedFilters.some(
        (filter) =>
          normalizedPath.startsWith(filter + "/") ||
          normalizedPath === filter ||
          normalizedPath.startsWith("./" + filter + "/") ||
          normalizedPath === "./" + filter
      );
    });
  }

  // Sort all results by score
  filteredResults.sort((a, b) => b.score - a.score);

  // Return top K
  const topK = options.topK ?? 10;
  return filteredResults.slice(0, topK);
}

/**
 * Create a search context for a specific module
 */
function createSearchContext(
  rootDir: string,
  moduleId: string,
  config: Config
): SearchContext {
  const indexPath = getModuleIndexPath(rootDir, moduleId, config);

  return {
    rootDir,
    config,

    loadFileIndex: async (filepath: string): Promise<FileIndex | null> => {
      // filepath may or may not have an extension
      // If it has an extension, replace it with .json; otherwise append .json
      const hasExtension = /\.[^./]+$/.test(filepath);
      const indexFilePath = hasExtension
        ? path.join(indexPath, filepath.replace(/\.[^.]+$/, ".json"))
        : path.join(indexPath, filepath + ".json");

      try {
        const content = await fs.readFile(indexFilePath, "utf-8");
        return JSON.parse(content);
      } catch {
        return null;
      }
    },

    listIndexedFiles: async (): Promise<string[]> => {
      const files: string[] = [];
      await traverseDirectory(indexPath, files, indexPath);

      // Convert index file paths back to source file paths
      return files
        .filter((f) => f.endsWith(".json") && !f.endsWith("manifest.json"))
        .map((f) => {
          const relative = path.relative(indexPath, f);
          // Convert .json back to original extension (we'll handle this generically)
          return relative.replace(/\.json$/, "");
        });
    },
  };
}

async function traverseDirectory(
  dir: string,
  files: string[],
  basePath: string
): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await traverseDirectory(fullPath, files, basePath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
}

async function loadGlobalManifest(
  rootDir: string,
  config: Config
): Promise<GlobalManifest | null> {
  const manifestPath = getGlobalManifestPath(rootDir, config);

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get a human-friendly name for a module ID
 */
function formatModuleName(moduleId: string): string {
  switch (moduleId) {
    case "core":
      return "Core";
    case "language/typescript":
      return "TypeScript";
    default:
      // Handle future modules: "language/python" -> "Python"
      if (moduleId.startsWith("language/")) {
        const lang = moduleId.replace("language/", "");
        return lang.charAt(0).toUpperCase() + lang.slice(1);
      }
      return moduleId;
  }
}

/**
 * Format search results for display
 * @param results - Array of search results to format
 * @returns Formatted string for console output
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No results found.";
  }

  let output = `Found ${results.length} results:\n\n`;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const { chunk } = result;

    // Format location with optional name
    const location = `${result.filepath}:${chunk.startLine}-${chunk.endLine}`;
    const nameInfo = chunk.name ? ` (${chunk.name})` : "";

    output += `${i + 1}. ${location}${nameInfo}\n`;
    output += `   Score: ${(result.score * 100).toFixed(1)}% | Type: ${
      chunk.type
    }`;

    // Show which module contributed this result
    output += ` | via ${formatModuleName(result.moduleId)}`;

    // Add export indicator
    if (chunk.isExported) {
      output += " | exported";
    }
    output += "\n";

    // Show preview (first 3 lines)
    const lines = chunk.content.split("\n").slice(0, 3);
    for (const line of lines) {
      const trimmedLine = line.substring(0, 80);
      output += `      ${trimmedLine}${line.length > 80 ? "..." : ""}\n`;
    }

    output += "\n";
  }

  return output;
}
