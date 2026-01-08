// Search module - queries across all enabled modules
import * as fs from "fs/promises";
import * as path from "path";
import { minimatch } from "minimatch";
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
import type {
  ExactMatchResults,
  HybridSearchResults,
} from "../../domain/entities";
import {
  loadConfig,
  getModuleIndexPath,
  getGlobalManifestPath,
  getModuleConfig,
  getRaggrepDir,
} from "../../infrastructure/config";
import { registry, registerBuiltInModules } from "../../modules/registry";
import { ensureIndexFresh } from "../indexer";
import {
  isIdentifierQuery,
  extractSearchLiteral,
} from "../../domain/services";
import { executeExactSearch } from "../../domain/usecases";
import { NodeFileSystem } from "../../infrastructure/filesystem";

/**
 * Search across all enabled modules
 */
export async function search(
  rootDir: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const hybridResults = await hybridSearch(rootDir, query, options);
  return hybridResults.results;
}

/**
 * Hybrid search with both semantic and exact match tracks.
 *
 * Returns:
 * - results: Semantic/BM25 results (existing behavior), with fusion boosting if applicable
 * - exactMatches: Exact match results for identifier queries (optional)
 */
export async function hybridSearch(
  rootDir: string,
  query: string,
  options: SearchOptions = {}
): Promise<HybridSearchResults> {
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
    return { results: [], fusionApplied: false };
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
    return { results: [], fusionApplied: false };
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
      return normalizedFilters.some((filter) => {
        // Check if the filter is a glob pattern
        const isGlobPattern = /[*?[\]{}!]/.test(filter);

        if (isGlobPattern) {
          // Use minimatch for glob patterns
          // Support patterns like "*.ts", "src/**/*.ts", "**/*.md"
          const pattern = filter.startsWith("**/") ? filter : `**/${filter}`;
          return minimatch(normalizedPath, pattern, { matchBase: true });
        } else {
          // Fall back to path prefix matching for non-glob patterns
          return (
            normalizedPath.startsWith(filter + "/") ||
            normalizedPath === filter ||
            normalizedPath.startsWith("./" + filter + "/") ||
            normalizedPath === "./" + filter
          );
        }
      });
    });
  }

  // Check if we should run simple search (identifier query)
  let exactMatches: ExactMatchResults | undefined;
  let fusionApplied = false;

  if (isIdentifierQuery(query)) {
    const literal = extractSearchLiteral(query);

    // Run exact match search
    exactMatches = await performExactSearch(rootDir, literal, config, options);

    // Apply fusion boosting: boost semantic results that also have exact matches
    if (exactMatches && exactMatches.totalMatches > 0) {
      const exactMatchFilepaths = new Set(
        exactMatches.files.map((f) => f.filepath)
      );

      for (const result of filteredResults) {
        // Check if this result's file has exact matches
        if (exactMatchFilepaths.has(result.filepath)) {
          // Apply fusion boost (1.5x for files with exact matches)
          result.score *= 1.5;

          // Mark in context
          if (!result.context) result.context = {};
          result.context.exactMatchFusion = true;

          fusionApplied = true;
        }
      }
    }
  }

  // Sort all results by score (re-sort after fusion boost)
  filteredResults.sort((a, b) => b.score - a.score);

  // Return top K
  const topK = options.topK ?? 10;

  return {
    results: filteredResults.slice(0, topK),
    exactMatches,
    fusionApplied,
  };
}

/**
 * Perform exact/literal search across all indexed files.
 *
 * This delegates to the domain use case which handles filesystem access
 * and search logic.
 */
async function performExactSearch(
  rootDir: string,
  literal: string,
  config: Config,
  options: SearchOptions
): Promise<ExactMatchResults> {
  const fs = new NodeFileSystem();

  return executeExactSearch(
    fs,
    {
      rootDir,
      literal,
      pathFilter: options.pathFilter,
      maxFiles: 20,
      maxOccurrencesPerFile: 5,
      caseInsensitive: false,
    },
    (path: string, pattern: string) => minimatch(path, pattern, { matchBase: true })
  );
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

    // Add fusion indicator
    if (result.context?.exactMatchFusion) {
      output += " | exact match";
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

/**
 * Format hybrid search results including exact matches.
 *
 * @param hybridResults - Results from hybridSearch
 * @returns Formatted string for console output
 */
export function formatHybridSearchResults(
  hybridResults: HybridSearchResults
): string {
  let output = "";

  // Show exact matches first if present
  if (
    hybridResults.exactMatches &&
    hybridResults.exactMatches.totalMatches > 0
  ) {
    const em = hybridResults.exactMatches;
    const showingCount = Math.min(em.files.length, 10);

    output += `┌─ Exact Matches `;
    if (em.truncated || em.files.length < em.totalFiles) {
      output += `(showing ${showingCount} of ${em.totalFiles} files, ${em.totalMatches} total matches)`;
    } else {
      output += `(${em.totalFiles} files, ${em.totalMatches} matches)`;
    }
    output += ` ─┐\n`;
    output += `│  Query: "${em.query}"\n`;
    output += `└─────────────────────────────────────────────────────────────────────┘\n\n`;

    for (let i = 0; i < Math.min(em.files.length, 10); i++) {
      const file = em.files[i];
      output += `  ${i + 1}. ${file.filepath}`;
      if (file.matchCount > 1) {
        output += ` (${file.matchCount} matches)`;
      }
      output += "\n";

      // Show first occurrence with context
      const firstOcc = file.occurrences[0];
      if (firstOcc) {
        // Show context before if available
        if (firstOcc.contextBefore) {
          const beforeLine = firstOcc.contextBefore.substring(0, 76);
          output += `     ${(firstOcc.line - 1).toString().padStart(4)} │ ${beforeLine}${firstOcc.contextBefore.length > 76 ? "..." : ""}\n`;
        }

        // Show the matching line with highlighting marker
        const matchLine = firstOcc.lineContent.substring(0, 76);
        output += `   ► ${firstOcc.line.toString().padStart(4)} │ ${matchLine}${firstOcc.lineContent.length > 76 ? "..." : ""}\n`;

        // Show context after if available
        if (firstOcc.contextAfter) {
          const afterLine = firstOcc.contextAfter.substring(0, 76);
          output += `     ${(firstOcc.line + 1).toString().padStart(4)} │ ${afterLine}${firstOcc.contextAfter.length > 76 ? "..." : ""}\n`;
        }
      }

      output += "\n";
    }

    // Separator between exact and semantic results
    if (hybridResults.results.length > 0) {
      output += "\n";
    }
  }

  // Show semantic results
  if (hybridResults.results.length > 0) {
    if (hybridResults.exactMatches?.totalMatches) {
      output += `┌─ Semantic Results `;
      if (hybridResults.fusionApplied) {
        output += `(boosted by exact matches) `;
      }
      output += `─┐\n`;
      output += `└─────────────────────────────────────────────────────────────────────┘\n\n`;
    }

    output += formatSearchResults(hybridResults.results);
  } else if (!hybridResults.exactMatches?.totalMatches) {
    output += "No results found.\n";
  }

  return output;
}
