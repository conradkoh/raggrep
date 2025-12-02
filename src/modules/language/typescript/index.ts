/**
 * TypeScript Language Index Module
 *
 * Provides TypeScript/JavaScript-aware code search using:
 * - AST parsing via TypeScript Compiler API
 * - Local text embeddings for semantic similarity
 * - BM25 keyword matching for fast filtering
 *
 * Index location: .raggrep/index/language/typescript/
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
  ChunkType,
} from "../../../types";
import {
  getEmbeddings,
  getEmbedding,
  configureEmbeddings,
  getEmbeddingConfig,
} from "../../../infrastructure/embeddings";
import { cosineSimilarity } from "../../../domain/services/similarity";
import { BM25Index, normalizeScore } from "../../../domain/services/bm25";
import {
  getEmbeddingConfigFromModule,
  getRaggrepDir,
} from "../../../infrastructure/config";
import { parseCode, generateChunkId } from "./parseCode";
import { SymbolicIndex } from "../../../infrastructure/storage";
import { extractKeywords } from "../../../domain/services/keywords";
import type { EmbeddingConfig } from "../../../domain/ports";
import type { FileSummary } from "../../../domain/entities";
import {
  parsePathContext,
  formatPathContextForEmbedding,
} from "../../../domain/services/keywords";

/** Default minimum similarity score for search results */
export const DEFAULT_MIN_SCORE = 0.15;

/** Default number of results to return */
export const DEFAULT_TOP_K = 10;

/** Weight for semantic similarity in hybrid scoring (0-1) */
const SEMANTIC_WEIGHT = 0.7;

/** Weight for BM25 keyword matching in hybrid scoring (0-1) */
const BM25_WEIGHT = 0.3;

/**
 * Module-specific data stored alongside file index
 */
export interface SemanticModuleData {
  embeddings: number[][];
  /** Store the model used for these embeddings for compatibility checking */
  embeddingModel: string;
  [key: string]: unknown; // Index signature for compatibility with Record<string, unknown>
}

export class TypeScriptModule implements IndexModule {
  readonly id = "language/typescript";
  readonly name = "TypeScript Search";
  readonly description =
    "TypeScript-aware code search with AST parsing and semantic embeddings";
  readonly version = "1.0.0";

  private embeddingConfig: EmbeddingConfig | null = null;
  private symbolicIndex: SymbolicIndex | null = null;
  private pendingSummaries: Map<string, FileSummary> = new Map();
  private rootDir: string = "";

  async initialize(config: ModuleConfig): Promise<void> {
    // Extract embedding config from module options
    this.embeddingConfig = getEmbeddingConfigFromModule(config);

    // Configure the embedding provider
    configureEmbeddings(this.embeddingConfig);

    // Clear pending summaries for fresh indexing
    this.pendingSummaries.clear();
  }

  async indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null> {
    // Store rootDir for finalize
    this.rootDir = ctx.rootDir;

    // Parse code into chunks
    const parsedChunks = parseCode(content, filepath);

    if (parsedChunks.length === 0) {
      return null;
    }

    // Parse path context for structural awareness
    const pathContext = parsePathContext(filepath);
    const pathPrefix = formatPathContextForEmbedding(pathContext);

    // Generate embeddings for all chunks with path context
    // Prepending path context helps the embedding model understand file structure
    const chunkContents = parsedChunks.map((c) => {
      // For named chunks, include the name for better embedding
      const namePrefix = c.name ? `${c.name}: ` : "";
      return `${pathPrefix} ${namePrefix}${c.content}`;
    });
    const embeddings = await getEmbeddings(chunkContents);

    // Create chunks with all metadata
    const chunks: Chunk[] = parsedChunks.map((pc) => ({
      id: generateChunkId(filepath, pc.startLine, pc.endLine),
      content: pc.content,
      startLine: pc.startLine,
      endLine: pc.endLine,
      type: pc.type,
      name: pc.name,
      isExported: pc.isExported,
      jsDoc: pc.jsDoc,
    }));

    // Extract references (imports)
    const references = this.extractReferences(content, filepath);

    const stats = await ctx.getFileStats(filepath);
    const currentConfig = getEmbeddingConfig();

    const moduleData: SemanticModuleData = {
      embeddings,
      embeddingModel: currentConfig.model,
    };

    // Build Tier 1 summary for this file
    const chunkTypes = [
      ...new Set(parsedChunks.map((pc) => pc.type)),
    ] as ChunkType[];
    const exports = parsedChunks
      .filter((pc) => pc.isExported && pc.name)
      .map((pc) => pc.name!);

    // Extract keywords from all chunks + path keywords
    const allKeywords = new Set<string>();
    for (const pc of parsedChunks) {
      const keywords = extractKeywords(pc.content, pc.name);
      keywords.forEach((k) => allKeywords.add(k));
    }
    // Add path keywords
    pathContext.keywords.forEach((k) => allKeywords.add(k));

    const fileSummary: FileSummary = {
      filepath,
      chunkCount: chunks.length,
      chunkTypes,
      keywords: Array.from(allKeywords),
      exports,
      lastModified: stats.lastModified,
      // Include parsed path context for search boosting
      pathContext: {
        segments: pathContext.segments,
        layer: pathContext.layer,
        domain: pathContext.domain,
        depth: pathContext.depth,
      },
    };

    // Store summary for finalize
    this.pendingSummaries.set(filepath, fileSummary);

    return {
      filepath,
      lastModified: stats.lastModified,
      chunks,
      moduleData,
      references,
    };
  }

  /**
   * Finalize indexing by building and saving the symbolic index
   */
  async finalize(ctx: IndexContext): Promise<void> {
    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);

    // Initialize symbolic index
    this.symbolicIndex = new SymbolicIndex(indexDir, this.id);
    await this.symbolicIndex.initialize();

    // Add all pending summaries
    for (const [filepath, summary] of this.pendingSummaries) {
      this.symbolicIndex.addFile(summary);
    }

    // Build BM25 index from summaries
    this.symbolicIndex.buildBM25Index();

    // Save to disk (creates symbolic/ folder with per-file summaries)
    await this.symbolicIndex.save();

    // Clear pending summaries
    this.pendingSummaries.clear();
  }

  /**
   * Search the semantic index for chunks matching the query.
   *
   * Uses a tiered approach for efficient search:
   * 1. Tier 1: Use BM25 on file summaries to find candidate files
   * 2. Tier 2: Load only candidate files and compute semantic similarity
   *
   * @param query - Natural language search query
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

    // Load symbolic index for BM25 scoring (not filtering)
    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);
    const symbolicIndex = new SymbolicIndex(indexDir, this.id);

    // Get ALL indexed files - semantic search needs to check all embeddings
    // BM25 contributes to the hybrid score but doesn't filter candidates
    let allFiles: string[];

    try {
      await symbolicIndex.initialize();
      allFiles = symbolicIndex.getAllFiles();
    } catch {
      // Symbolic index doesn't exist, fall back to loading all files
      allFiles = await ctx.listIndexedFiles();
    }

    // Apply file pattern filter if specified
    let filesToSearch = allFiles;
    if (filePatterns && filePatterns.length > 0) {
      filesToSearch = allFiles.filter((filepath) => {
        return filePatterns.some((pattern) => {
          if (pattern.startsWith("*.")) {
            const ext = pattern.slice(1);
            return filepath.endsWith(ext);
          }
          return filepath.includes(pattern);
        });
      });
    }

    // Get query embedding for semantic search
    const queryEmbedding = await getEmbedding(query);

    // Load all indexed files and compute scores
    // BM25 is used for keyword scoring, not filtering
    const bm25Index = new BM25Index();
    const allChunksData: Array<{
      filepath: string;
      chunk: Chunk;
      embedding: number[];
    }> = [];

    for (const filepath of filesToSearch) {
      const fileIndex = await ctx.loadFileIndex(filepath);
      if (!fileIndex) continue;

      const moduleData = fileIndex.moduleData as unknown as SemanticModuleData;
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

        // Add to BM25 index for chunk-level keyword matching
        bm25Index.addDocuments([{ id: chunk.id, content: chunk.content }]);
      }
    }

    // Perform BM25 search at chunk level
    const bm25Results = bm25Index.search(query, topK * 3);
    const bm25Scores = new Map<string, number>();

    for (const result of bm25Results) {
      bm25Scores.set(result.id, normalizeScore(result.score, 3));
    }

    // Extract query terms for path matching
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    // Build path boost map from file summaries
    const pathBoosts = new Map<string, number>();
    for (const filepath of filesToSearch) {
      const summary = symbolicIndex.getFileSummary(filepath);
      if (summary?.pathContext) {
        let boost = 0;
        const ctx = summary.pathContext;

        // Check if query terms match domain
        if (
          ctx.domain &&
          queryTerms.some(
            (t) => ctx.domain!.includes(t) || t.includes(ctx.domain!)
          )
        ) {
          boost += 0.1;
        }

        // Check if query terms match layer
        if (
          ctx.layer &&
          queryTerms.some(
            (t) => ctx.layer!.includes(t) || t.includes(ctx.layer!)
          )
        ) {
          boost += 0.05;
        }

        // Check if query terms match path segments
        const segmentMatch = ctx.segments.some((seg) =>
          queryTerms.some(
            (t) =>
              seg.toLowerCase().includes(t) || t.includes(seg.toLowerCase())
          )
        );
        if (segmentMatch) {
          boost += 0.05;
        }

        pathBoosts.set(filepath, boost);
      }
    }

    // Calculate hybrid scores for all chunks
    const results: SearchResult[] = [];

    for (const { filepath, chunk, embedding } of allChunksData) {
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      const bm25Score = bm25Scores.get(chunk.id) || 0;
      const pathBoost = pathBoosts.get(filepath) || 0;

      // Hybrid score: weighted combination of semantic, BM25, and path boost
      const hybridScore =
        SEMANTIC_WEIGHT * semanticScore + BM25_WEIGHT * bm25Score + pathBoost;

      if (hybridScore >= minScore || bm25Score > 0.3) {
        results.push({
          filepath,
          chunk,
          score: hybridScore,
          moduleId: this.id,
          context: {
            semanticScore,
            bm25Score,
            pathBoost,
          },
        });
      }
    }

    // Sort by score descending and take top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private extractReferences(content: string, filepath: string): string[] {
    const references: string[] = [];

    // Extract import statements
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith(".")) {
        const dir = path.dirname(filepath);
        const resolved = path.normalize(path.join(dir, importPath));
        references.push(resolved);
      }
    }

    while ((match = requireRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith(".")) {
        const dir = path.dirname(filepath);
        const resolved = path.normalize(path.join(dir, importPath));
        references.push(resolved);
      }
    }

    return references;
  }
}
