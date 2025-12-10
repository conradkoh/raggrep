/**
 * JSON Data Index Module
 *
 * Provides JSON file search using:
 * - Literal indexing of dot-notation key paths (e.g., "package.dependencies.react")
 * - BM25 keyword matching for fuzzy search
 *
 * Note: This module uses literal-only indexing (no embeddings) for fast indexing.
 * JSON keys are indexed as dot-notation paths prefixed with the filename.
 *
 * Supported file types: .json
 *
 * Index location: .raggrep/index/data/json/
 */

import * as path from "path";
import {
  IndexModule,
  IndexContext,
  SearchContext,
  SearchOptions,
  FileIndex,
  SearchResult,
  Chunk,
  ModuleConfig,
} from "../../../types";
import {
  BM25Index,
  normalizeScore,
  generateChunkId,
  // Literal boosting
  parseQueryLiterals,
  calculateLiteralContribution,
  applyLiteralBoost,
  LITERAL_SCORING_CONSTANTS,
  // JSON path extraction
  extractJsonPaths,
  extractJsonKeywords,
} from "../../../domain/services";
import { getRaggrepDir } from "../../../infrastructure/config";
import { SymbolicIndex, LiteralIndex } from "../../../infrastructure/storage";
import type { Logger } from "../../../domain/ports";
import type {
  FileSummary,
  ExtractedLiteral,
  LiteralMatch,
} from "../../../domain/entities";

/** Default minimum similarity score for search results */
export const DEFAULT_MIN_SCORE = 0.1;

/** Default number of results to return */
export const DEFAULT_TOP_K = 10;

/** Weight for BM25 keyword matching in scoring */
const BM25_WEIGHT = 0.4;

/** Weight for literal matching in scoring */
const LITERAL_WEIGHT = 0.6;

/** File extensions supported by this module */
export const JSON_EXTENSIONS = [".json"];

/**
 * Check if a file is supported by this module.
 */
export function isJsonFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return JSON_EXTENSIONS.includes(ext);
}

// Re-export for module interface
export const supportsFile = isJsonFile;

/**
 * Module-specific data stored alongside file index
 */
export interface JsonModuleData {
  /** Dot-notation paths extracted from the JSON file */
  jsonPaths: string[];
  [key: string]: unknown;
}

export class JsonModule implements IndexModule {
  readonly id = "data/json";
  readonly name = "JSON Search";
  readonly description =
    "JSON file search with literal-based key path indexing";
  readonly version = "2.0.0"; // Bumped for literal-only mode

  supportsFile(filepath: string): boolean {
    return isJsonFile(filepath);
  }

  private symbolicIndex: SymbolicIndex | null = null;
  private literalIndex: LiteralIndex | null = null;
  private pendingSummaries: Map<string, FileSummary> = new Map();
  /** Map from chunkId → { filepath, literals } for building literal index */
  private pendingLiterals: Map<
    string,
    { filepath: string; literals: ExtractedLiteral[] }
  > = new Map();
  private rootDir: string = "";
  private logger: Logger | undefined = undefined;

  async initialize(config: ModuleConfig): Promise<void> {
    this.logger = config.options?.logger as Logger | undefined;
    this.pendingSummaries.clear();
    this.pendingLiterals.clear();
  }

  async indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null> {
    // Only process JSON files
    if (!isJsonFile(filepath)) {
      return null;
    }

    this.rootDir = ctx.rootDir;

    // Parse JSON content
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON, skip indexing
      return null;
    }

    // Get filename without extension for path prefix
    const fileBasename = path.basename(filepath, path.extname(filepath));

    // Extract dot-notation paths as literals
    const jsonPathLiterals = extractJsonPaths(parsed, fileBasename);

    // Count lines for chunk metadata
    const lines = content.split("\n");
    const lineCount = lines.length;

    // Create single chunk for the entire file
    const chunkId = generateChunkId(filepath, 1, lineCount);
    const chunks: Chunk[] = [
      {
        id: chunkId,
        content: content,
        startLine: 1,
        endLine: lineCount,
        type: "file",
      },
    ];

    // Store literals for finalize
    if (jsonPathLiterals.length > 0) {
      this.pendingLiterals.set(chunkId, {
        filepath,
        literals: jsonPathLiterals,
      });
    }

    const stats = await ctx.getFileStats(filepath);

    // Module data without embeddings
    const moduleData: JsonModuleData = {
      jsonPaths: jsonPathLiterals.map((l) => l.value),
    };

    // Build file summary with keywords for BM25
    const keywords = extractJsonKeywords(parsed);

    const fileSummary: FileSummary = {
      filepath,
      chunkCount: 1,
      chunkTypes: ["file"],
      keywords,
      exports: [], // JSON files don't have exports
      lastModified: stats.lastModified,
    };

    this.pendingSummaries.set(filepath, fileSummary);

    return {
      filepath,
      lastModified: stats.lastModified,
      chunks,
      moduleData,
    };
  }

  /**
   * Finalize indexing by building and saving the symbolic and literal indexes.
   * Uses incremental updates when possible to avoid full rebuilds.
   */
  async finalize(ctx: IndexContext): Promise<void> {
    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);

    // Initialize symbolic index (loads existing data including BM25)
    this.symbolicIndex = new SymbolicIndex(indexDir, this.id);
    await this.symbolicIndex.initialize();

    // Track which files were updated for incremental save
    const updatedFilepaths: string[] = [];

    // Add all pending summaries incrementally (updates BM25 as we go)
    for (const [filepath, summary] of this.pendingSummaries) {
      this.symbolicIndex.addFileIncremental(summary);
      updatedFilepaths.push(filepath);
    }

    // Save to disk (only saves updated files + serialized BM25)
    if (updatedFilepaths.length > 0) {
      await this.symbolicIndex.saveIncremental(updatedFilepaths);
    }

    // Initialize and build literal index
    this.literalIndex = new LiteralIndex(indexDir, this.id);
    await this.literalIndex.initialize();

    // Get all filepaths that were indexed in this run
    const indexedFilepaths = new Set<string>();
    for (const filepath of this.pendingSummaries.keys()) {
      indexedFilepaths.add(filepath);
    }
    for (const { filepath } of this.pendingLiterals.values()) {
      indexedFilepaths.add(filepath);
    }

    // Remove old literals for all files that were re-indexed
    for (const filepath of indexedFilepaths) {
      this.literalIndex.removeFile(filepath);
    }

    // Add all pending literals
    for (const [chunkId, { filepath, literals }] of this.pendingLiterals) {
      this.literalIndex.addLiterals(chunkId, filepath, literals);
    }

    // Save literal index to disk
    await this.literalIndex.save();

    // Clear pending data
    this.pendingSummaries.clear();
    this.pendingLiterals.clear();
  }

  /**
   * Search the JSON index for files matching the query.
   *
   * Uses a two-source approach:
   * 1. Literal index for exact path matches (e.g., `package.dependencies.react`)
   * 2. BM25 keyword search for fuzzy matching
   *
   * @param query - Search query (supports backticks for exact literal matching)
   * @param ctx - Search context with index access
   * @param options - Search options (topK, minScore, filePatterns)
   * @returns Array of search results sorted by relevance
   */
  async search(
    query: string,
    ctx: SearchContext,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      topK = DEFAULT_TOP_K,
      minScore = DEFAULT_MIN_SCORE,
      filePatterns,
    } = options;

    // Parse query for literals (explicit backticks/quotes and implicit patterns)
    const { literals: queryLiterals, remainingQuery } =
      parseQueryLiterals(query);

    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);

    // Load symbolic index for BM25 and file listing
    const symbolicIndex = new SymbolicIndex(indexDir, this.id);

    // Load literal index for exact-match boosting
    const literalIndex = new LiteralIndex(indexDir, this.id);
    let literalMatchMap = new Map<string, LiteralMatch[]>();

    try {
      await literalIndex.initialize();
      literalMatchMap = literalIndex.buildMatchMap(queryLiterals);
    } catch {
      // Literal index doesn't exist yet, continue without it
    }

    // Get all indexed JSON files
    let allFiles: string[];
    try {
      await symbolicIndex.initialize();
      allFiles = symbolicIndex.getAllFiles();
    } catch {
      allFiles = await ctx.listIndexedFiles();
    }

    // Filter to JSON files only
    let filesToSearch = allFiles.filter((f) => isJsonFile(f));

    // Apply file pattern filter if specified
    if (filePatterns && filePatterns.length > 0) {
      filesToSearch = filesToSearch.filter((filepath) => {
        return filePatterns.some((pattern) => {
          if (pattern.startsWith("*.")) {
            const ext = pattern.slice(1);
            return filepath.endsWith(ext);
          }
          return filepath.includes(pattern);
        });
      });
    }

    // Build BM25 index from all chunks
    const bm25Index = new BM25Index();
    const allChunksData: Array<{
      filepath: string;
      chunk: Chunk;
    }> = [];

    for (const filepath of filesToSearch) {
      const fileIndex = await ctx.loadFileIndex(filepath);
      if (!fileIndex) continue;

      for (const chunk of fileIndex.chunks) {
        allChunksData.push({
          filepath: fileIndex.filepath,
          chunk,
        });

        // Add to BM25 index
        bm25Index.addDocuments([{ id: chunk.id, content: chunk.content }]);
      }
    }

    // Perform BM25 search
    const bm25Results = bm25Index.search(query, topK * 3);
    const bm25Scores = new Map<string, number>();

    for (const result of bm25Results) {
      bm25Scores.set(result.id, normalizeScore(result.score, 3));
    }

    // Calculate scores for all chunks
    const results: SearchResult[] = [];
    const processedChunkIds = new Set<string>();

    for (const { filepath, chunk } of allChunksData) {
      const bm25Score = bm25Scores.get(chunk.id) || 0;

      // Get literal matches for this chunk
      const literalMatches = literalMatchMap.get(chunk.id) || [];
      const literalContribution = calculateLiteralContribution(
        literalMatches,
        bm25Score > 0 // hasSemanticOrBm25
      );

      // Base score from BM25
      const baseScore = BM25_WEIGHT * bm25Score;

      // Apply literal boosting
      const boostedScore = applyLiteralBoost(
        baseScore,
        literalMatches,
        bm25Score > 0
      );

      // Add literal contribution if no BM25 score
      const literalBase =
        literalMatches.length > 0 && bm25Score === 0
          ? LITERAL_SCORING_CONSTANTS.BASE_SCORE * LITERAL_WEIGHT
          : 0;

      const finalScore = boostedScore + literalBase;

      processedChunkIds.add(chunk.id);

      // Include if score meets threshold or has literal matches
      if (finalScore >= minScore || literalMatches.length > 0) {
        results.push({
          filepath,
          chunk,
          score: finalScore,
          moduleId: this.id,
          context: {
            bm25Score,
            literalMultiplier: literalContribution.multiplier,
            literalMatchType: literalContribution.bestMatchType,
            literalConfidence: literalContribution.bestConfidence,
            literalMatchCount: literalContribution.matchCount,
          },
        });
      }
    }

    // Add literal-only results (chunks found by literal index but not loaded)
    for (const [chunkId, matches] of literalMatchMap) {
      if (processedChunkIds.has(chunkId)) {
        continue;
      }

      const filepath = matches[0]?.filepath;
      if (!filepath) continue;

      // Load the file index
      const fileIndex = await ctx.loadFileIndex(filepath);
      if (!fileIndex) continue;

      const chunk = fileIndex.chunks.find((c) => c.id === chunkId);
      if (!chunk) continue;

      const literalContribution = calculateLiteralContribution(matches, false);

      const score =
        LITERAL_SCORING_CONSTANTS.BASE_SCORE * literalContribution.multiplier;

      processedChunkIds.add(chunkId);

      results.push({
        filepath,
        chunk,
        score,
        moduleId: this.id,
        context: {
          bm25Score: 0,
          literalMultiplier: literalContribution.multiplier,
          literalMatchType: literalContribution.bestMatchType,
          literalConfidence: literalContribution.bestConfidence,
          literalMatchCount: literalContribution.matchCount,
          literalOnly: true,
        },
      });
    }

    // Sort by score descending and take top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
