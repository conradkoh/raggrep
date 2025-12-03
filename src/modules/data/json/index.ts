/**
 * JSON Data Index Module
 *
 * Provides JSON file search using:
 * - JSON structure parsing
 * - Local text embeddings for semantic similarity
 * - Key/value extraction for better search
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
  getEmbeddings,
  getEmbedding,
  configureEmbeddings,
  getEmbeddingConfig,
} from "../../../infrastructure/embeddings";
import {
  cosineSimilarity,
  BM25Index,
  normalizeScore,
  extractQueryTerms,
  createLineBasedChunks,
  generateChunkId,
} from "../../../domain/services";
import {
  getEmbeddingConfigFromModule,
  getRaggrepDir,
} from "../../../infrastructure/config";
import { SymbolicIndex } from "../../../infrastructure/storage";
import type { EmbeddingConfig, Logger } from "../../../domain/ports";
import type { FileSummary } from "../../../domain/entities";

/** Default minimum similarity score for search results */
export const DEFAULT_MIN_SCORE = 0.15;

/** Default number of results to return */
export const DEFAULT_TOP_K = 10;

/** Weight for semantic similarity in hybrid scoring (0-1) */
const SEMANTIC_WEIGHT = 0.7;

/** Weight for BM25 keyword matching in hybrid scoring (0-1) */
const BM25_WEIGHT = 0.3;

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
 * Extract all keys from a JSON object recursively.
 */
function extractJsonKeys(obj: unknown, prefix = ""): string[] {
  const keys: string[] = [];

  if (obj === null || obj === undefined) {
    return keys;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      keys.push(...extractJsonKeys(item, `${prefix}[${index}]`));
    });
  } else if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.push(key);
      keys.push(...extractJsonKeys(value, fullKey));
    }
  }

  return keys;
}

/**
 * Extract keywords from JSON content for BM25 search.
 */
function extractJsonKeywords(content: string): string[] {
  try {
    const parsed = JSON.parse(content);
    const keys = extractJsonKeys(parsed);

    // Also extract string values
    const stringValues: string[] = [];
    const extractStrings = (obj: unknown): void => {
      if (typeof obj === "string") {
        // Split camelCase and extract words
        const words = obj
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2);
        stringValues.push(...words);
      } else if (Array.isArray(obj)) {
        obj.forEach(extractStrings);
      } else if (obj && typeof obj === "object") {
        Object.values(obj as Record<string, unknown>).forEach(extractStrings);
      }
    };
    extractStrings(parsed);

    return [...new Set([...keys, ...stringValues])];
  } catch {
    // If JSON parsing fails, return empty keywords
    return [];
  }
}

/**
 * Module-specific data stored alongside file index
 */
export interface JsonModuleData {
  embeddings: number[][];
  embeddingModel: string;
  jsonKeys: string[];
  [key: string]: unknown;
}

export class JsonModule implements IndexModule {
  readonly id = "data/json";
  readonly name = "JSON Search";
  readonly description = "JSON file search with structure-aware indexing";
  readonly version = "1.0.0";

  supportsFile(filepath: string): boolean {
    return isJsonFile(filepath);
  }

  private embeddingConfig: EmbeddingConfig | null = null;
  private symbolicIndex: SymbolicIndex | null = null;
  private pendingSummaries: Map<string, FileSummary> = new Map();
  private rootDir: string = "";
  private logger: Logger | undefined = undefined;

  async initialize(config: ModuleConfig): Promise<void> {
    this.embeddingConfig = getEmbeddingConfigFromModule(config);
    this.logger = config.options?.logger as Logger | undefined;

    if (this.logger) {
      this.embeddingConfig = {
        ...this.embeddingConfig,
        logger: this.logger,
      };
    }

    configureEmbeddings(this.embeddingConfig);
    this.pendingSummaries.clear();
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

    // Create chunks from JSON content
    const textChunks = createLineBasedChunks(content, {
      chunkSize: 50,
      overlap: 10,
    });

    if (textChunks.length === 0) {
      return null;
    }

    // Generate embeddings for chunks
    const chunkContents = textChunks.map((c) => {
      // Include file context in embedding
      const filename = path.basename(filepath);
      return `${filename}: ${c.content}`;
    });
    const embeddings = await getEmbeddings(chunkContents);

    // Create chunks with metadata
    const chunks: Chunk[] = textChunks.map((tc, i) => ({
      id: generateChunkId(filepath, tc.startLine, tc.endLine),
      content: tc.content,
      startLine: tc.startLine,
      endLine: tc.endLine,
      type: tc.type,
    }));

    // Extract JSON keys for metadata
    const jsonKeys = extractJsonKeys(
      (() => {
        try {
          return JSON.parse(content);
        } catch {
          return {};
        }
      })()
    );

    const stats = await ctx.getFileStats(filepath);
    const currentConfig = getEmbeddingConfig();

    const moduleData: JsonModuleData = {
      embeddings,
      embeddingModel: currentConfig.model,
      jsonKeys,
    };

    // Build file summary
    const keywords = extractJsonKeywords(content);

    const fileSummary: FileSummary = {
      filepath,
      chunkCount: chunks.length,
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

  async finalize(ctx: IndexContext): Promise<void> {
    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);

    this.symbolicIndex = new SymbolicIndex(indexDir, this.id);
    await this.symbolicIndex.initialize();

    for (const [filepath, summary] of this.pendingSummaries) {
      this.symbolicIndex.addFile(summary);
    }

    this.symbolicIndex.buildBM25Index();
    await this.symbolicIndex.save();
    this.pendingSummaries.clear();
  }

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

    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);
    const symbolicIndex = new SymbolicIndex(indexDir, this.id);

    let allFiles: string[];

    try {
      await symbolicIndex.initialize();
      allFiles = symbolicIndex.getAllFiles();
    } catch {
      allFiles = await ctx.listIndexedFiles();
    }

    // Filter to JSON files only
    let filesToSearch = allFiles.filter((f) => isJsonFile(f));

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

    const queryEmbedding = await getEmbedding(query);
    const bm25Index = new BM25Index();
    const allChunksData: Array<{
      filepath: string;
      chunk: Chunk;
      embedding: number[];
    }> = [];

    for (const filepath of filesToSearch) {
      const fileIndex = await ctx.loadFileIndex(filepath);
      if (!fileIndex) continue;

      const moduleData = fileIndex.moduleData as unknown as JsonModuleData;
      if (!moduleData?.embeddings) continue;

      for (let i = 0; i < fileIndex.chunks.length; i++) {
        const chunk = fileIndex.chunks[i];
        const embedding = moduleData.embeddings[i];

        if (!embedding) continue;

        allChunksData.push({
          filepath: fileIndex.filepath,
          chunk,
          embedding,
        });

        bm25Index.addDocuments([{ id: chunk.id, content: chunk.content }]);
      }
    }

    const bm25Results = bm25Index.search(query, topK * 3);
    const bm25Scores = new Map<string, number>();

    for (const result of bm25Results) {
      bm25Scores.set(result.id, normalizeScore(result.score, 3));
    }

    const queryTerms = extractQueryTerms(query);
    const results: SearchResult[] = [];

    for (const { filepath, chunk, embedding } of allChunksData) {
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      const bm25Score = bm25Scores.get(chunk.id) || 0;

      const hybridScore =
        SEMANTIC_WEIGHT * semanticScore + BM25_WEIGHT * bm25Score;

      if (hybridScore >= minScore || bm25Score > 0.3) {
        results.push({
          filepath,
          chunk,
          score: hybridScore,
          moduleId: this.id,
          context: {
            semanticScore,
            bm25Score,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
