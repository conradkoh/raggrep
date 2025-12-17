/**
 * Rust Language Index Module
 *
 * Provides Rust-aware code search using:
 * - AST parsing via tree-sitter (with regex fallback)
 * - Local text embeddings for semantic similarity
 * - BM25 keyword matching for fast filtering
 *
 * Supported file types: .rs
 *
 * Index location: .raggrep/index/language/rust/
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
import {
  cosineSimilarity,
  BM25Index,
  normalizeScore,
  extractKeywords,
  parsePathContext,
  formatPathContextForEmbedding,
  calculateFileTypeBoost,
  extractQueryTerms,
  parseQueryLiterals,
  extractLiterals,
  calculateLiteralContribution,
  applyLiteralBoost,
  LITERAL_SCORING_CONSTANTS,
  expandQuery,
} from "../../../domain/services";
import {
  getEmbeddingConfigFromModule,
  getRaggrepDir,
} from "../../../infrastructure/config";
import { SymbolicIndex, LiteralIndex } from "../../../infrastructure/storage";
import { createParserForFile } from "../../../infrastructure/parsing";
import type { EmbeddingConfig, Logger, ParsedChunk } from "../../../domain/ports";
import type { FileSummary, ExtractedLiteral, LiteralMatch } from "../../../domain/entities";

/** Default minimum similarity score for search results */
export const DEFAULT_MIN_SCORE = 0.15;

/** Default number of results to return */
export const DEFAULT_TOP_K = 10;

/** Weight for semantic similarity in hybrid scoring (0-1) */
const SEMANTIC_WEIGHT = 0.7;

/** Weight for BM25 keyword matching in hybrid scoring (0-1) */
const BM25_WEIGHT = 0.3;

/** File extensions supported by this module */
export const RUST_EXTENSIONS = [".rs"];

/**
 * Check if a file is supported by this module.
 */
export function isRustFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return RUST_EXTENSIONS.includes(ext);
}

// Re-export for module interface
export const supportsFile = isRustFile;

/**
 * Generate a unique chunk ID from filepath and line numbers.
 */
function generateChunkId(
  filepath: string,
  startLine: number,
  endLine: number
): string {
  const safePath = filepath.replace(/[/\\]/g, "-").replace(/\./g, "_");
  return `${safePath}-${startLine}-${endLine}`;
}

/**
 * Calculate boost based on chunk type.
 */
function calculateChunkTypeBoost(chunk: Chunk): number {
  switch (chunk.type) {
    case "function":
      return 0.05;
    case "class": // Struct
    case "interface": // Trait
      return 0.04;
    case "enum":
      return 0.03;
    case "type":
      return 0.02;
    case "file":
    case "block":
    default:
      return 0;
  }
}

/**
 * Calculate boost for exported symbols.
 * In Rust, pub items are exported.
 */
function calculateExportBoost(chunk: Chunk): number {
  return chunk.isExported ? 0.03 : 0;
}

/**
 * Module-specific data stored alongside file index.
 */
export interface RustModuleData {
  embeddings: number[][];
  embeddingModel: string;
  [key: string]: unknown;
}

export class RustModule implements IndexModule {
  readonly id = "language/rust";
  readonly name = "Rust Search";
  readonly description =
    "Rust-aware code search with AST parsing and semantic embeddings";
  readonly version = "1.0.0";

  supportsFile(filepath: string): boolean {
    return isRustFile(filepath);
  }

  private embeddingConfig: EmbeddingConfig | null = null;
  private symbolicIndex: SymbolicIndex | null = null;
  private literalIndex: LiteralIndex | null = null;
  private pendingSummaries: Map<string, FileSummary> = new Map();
  private pendingLiterals: Map<
    string,
    { filepath: string; literals: ExtractedLiteral[] }
  > = new Map();
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
    this.pendingLiterals.clear();
  }

  async indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null> {
    if (!isRustFile(filepath)) {
      return null;
    }

    this.rootDir = ctx.rootDir;

    // Get the parser for Rust files
    const parser = createParserForFile(filepath);

    if (!parser) {
      return null;
    }

    // Parse the file
    const parseResult = await parser.parse(content, filepath, {
      includeFullFileChunk: true,
      associateComments: true,
    });

    if (!parseResult.success || parseResult.chunks.length === 0) {
      // Fall back to regex-based parsing
      const fallbackChunks = this.parseRustRegex(content, filepath);
      if (fallbackChunks.length === 0) {
        return null;
      }

      return this.createFileIndex(filepath, content, fallbackChunks, ctx);
    }

    return this.createFileIndex(filepath, content, parseResult.chunks, ctx);
  }

  /**
   * Regex-based fallback parser for Rust.
   */
  private parseRustRegex(content: string, filepath: string): ParsedChunk[] {
    const chunks: ParsedChunk[] = [];
    const lines = content.split("\n");

    // Add full file chunk
    chunks.push({
      content,
      startLine: 1,
      endLine: lines.length,
      type: "file",
      name: path.basename(filepath),
    });

    // Match function declarations
    const funcRegex = /^(pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/gm;
    let match;

    while ((match = funcRegex.exec(content)) !== null) {
      const startIdx = match.index;
      const isPublic = !!match[1];
      const name = match[2];
      const startLine = content.slice(0, startIdx).split("\n").length;

      // Find the end of the function (matching braces)
      let braceCount = 0;
      let endLine = startLine;
      let foundStart = false;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === "{") {
            braceCount++;
            foundStart = true;
          } else if (char === "}") {
            braceCount--;
          }
        }

        if (foundStart && braceCount === 0) {
          endLine = i + 1;
          break;
        }
        endLine = i + 1;
      }

      const funcContent = lines.slice(startLine - 1, endLine).join("\n");

      // Extract doc comment (Rust uses /// for doc comments)
      let docComment: string | undefined;
      const docLines: string[] = [];
      for (let i = startLine - 2; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("///") || line.startsWith("//!")) {
          docLines.unshift(line.slice(3).trim());
        } else if (line === "") {
          continue;
        } else {
          break;
        }
      }
      if (docLines.length > 0) {
        docComment = docLines.join("\n");
      }

      chunks.push({
        content: funcContent,
        startLine,
        endLine,
        type: "function",
        name,
        isExported: isPublic,
        docComment,
      });
    }

    // Match struct declarations
    const structRegex = /^(pub(?:\s*\([^)]*\))?\s+)?struct\s+(\w+)/gm;

    while ((match = structRegex.exec(content)) !== null) {
      const startIdx = match.index;
      const isPublic = !!match[1];
      const name = match[2];
      const startLine = content.slice(0, startIdx).split("\n").length;

      // Find end of struct
      let braceCount = 0;
      let endLine = startLine;
      let foundStart = false;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];

        // Handle tuple structs: struct Foo(i32);
        if (!foundStart && line.includes(";") && !line.includes("{")) {
          endLine = i + 1;
          break;
        }

        for (const char of line) {
          if (char === "{") {
            braceCount++;
            foundStart = true;
          } else if (char === "}") {
            braceCount--;
          }
        }

        if (foundStart && braceCount === 0) {
          endLine = i + 1;
          break;
        }
        endLine = i + 1;
      }

      const structContent = lines.slice(startLine - 1, endLine).join("\n");

      // Extract doc comment
      let docComment: string | undefined;
      const docLines: string[] = [];
      for (let i = startLine - 2; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("///") || line.startsWith("//!")) {
          docLines.unshift(line.slice(3).trim());
        } else if (line === "") {
          continue;
        } else {
          break;
        }
      }
      if (docLines.length > 0) {
        docComment = docLines.join("\n");
      }

      chunks.push({
        content: structContent,
        startLine,
        endLine,
        type: "class",
        name,
        isExported: isPublic,
        docComment,
      });
    }

    // Match trait declarations
    const traitRegex = /^(pub(?:\s*\([^)]*\))?\s+)?trait\s+(\w+)/gm;

    while ((match = traitRegex.exec(content)) !== null) {
      const startIdx = match.index;
      const isPublic = !!match[1];
      const name = match[2];
      const startLine = content.slice(0, startIdx).split("\n").length;

      let braceCount = 0;
      let endLine = startLine;
      let foundStart = false;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === "{") {
            braceCount++;
            foundStart = true;
          } else if (char === "}") {
            braceCount--;
          }
        }

        if (foundStart && braceCount === 0) {
          endLine = i + 1;
          break;
        }
        endLine = i + 1;
      }

      const traitContent = lines.slice(startLine - 1, endLine).join("\n");

      let docComment: string | undefined;
      const docLines: string[] = [];
      for (let i = startLine - 2; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("///") || line.startsWith("//!")) {
          docLines.unshift(line.slice(3).trim());
        } else if (line === "") {
          continue;
        } else {
          break;
        }
      }
      if (docLines.length > 0) {
        docComment = docLines.join("\n");
      }

      chunks.push({
        content: traitContent,
        startLine,
        endLine,
        type: "interface",
        name,
        isExported: isPublic,
        docComment,
      });
    }

    // Match enum declarations
    const enumRegex = /^(pub(?:\s*\([^)]*\))?\s+)?enum\s+(\w+)/gm;

    while ((match = enumRegex.exec(content)) !== null) {
      const startIdx = match.index;
      const isPublic = !!match[1];
      const name = match[2];
      const startLine = content.slice(0, startIdx).split("\n").length;

      let braceCount = 0;
      let endLine = startLine;
      let foundStart = false;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === "{") {
            braceCount++;
            foundStart = true;
          } else if (char === "}") {
            braceCount--;
          }
        }

        if (foundStart && braceCount === 0) {
          endLine = i + 1;
          break;
        }
        endLine = i + 1;
      }

      const enumContent = lines.slice(startLine - 1, endLine).join("\n");

      let docComment: string | undefined;
      const docLines: string[] = [];
      for (let i = startLine - 2; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("///") || line.startsWith("//!")) {
          docLines.unshift(line.slice(3).trim());
        } else if (line === "") {
          continue;
        } else {
          break;
        }
      }
      if (docLines.length > 0) {
        docComment = docLines.join("\n");
      }

      chunks.push({
        content: enumContent,
        startLine,
        endLine,
        type: "enum",
        name,
        isExported: isPublic,
        docComment,
      });
    }

    return chunks;
  }

  /**
   * Create file index from parsed chunks.
   */
  private async createFileIndex(
    filepath: string,
    content: string,
    parsedChunks: ParsedChunk[],
    ctx: IndexContext
  ): Promise<FileIndex | null> {
    const pathContext = parsePathContext(filepath);
    const pathPrefix = formatPathContextForEmbedding(pathContext);

    const chunkContents = parsedChunks.map((c) => {
      const namePrefix = c.name ? `${c.name}: ` : "";
      const docPrefix = c.docComment ? `${c.docComment} ` : "";
      return `${pathPrefix} ${namePrefix}${docPrefix}${c.content}`;
    });
    const embeddings = await getEmbeddings(chunkContents);

    const chunks: Chunk[] = parsedChunks.map((pc) => ({
      id: generateChunkId(filepath, pc.startLine, pc.endLine),
      content: pc.content,
      startLine: pc.startLine,
      endLine: pc.endLine,
      type: pc.type as ChunkType,
      name: pc.name,
      isExported: pc.isExported,
      jsDoc: pc.docComment,
    }));

    const stats = await ctx.getFileStats(filepath);
    const currentConfig = getEmbeddingConfig();

    const moduleData: RustModuleData = {
      embeddings,
      embeddingModel: currentConfig.model,
    };

    const chunkTypes = [
      ...new Set(parsedChunks.map((pc) => pc.type as ChunkType)),
    ];
    const exports = parsedChunks
      .filter((pc) => pc.isExported && pc.name)
      .map((pc) => pc.name!);

    const allKeywords = new Set<string>();
    for (const pc of parsedChunks) {
      const keywords = extractKeywords(pc.content, pc.name);
      keywords.forEach((k) => allKeywords.add(k));
    }
    pathContext.keywords.forEach((k) => allKeywords.add(k));

    const fileSummary: FileSummary = {
      filepath,
      chunkCount: chunks.length,
      chunkTypes,
      keywords: Array.from(allKeywords),
      exports,
      lastModified: stats.lastModified,
      pathContext: {
        segments: pathContext.segments,
        layer: pathContext.layer,
        domain: pathContext.domain,
        depth: pathContext.depth,
      },
    };

    this.pendingSummaries.set(filepath, fileSummary);

    for (const chunk of chunks) {
      const literals = extractLiterals(chunk);
      if (literals.length > 0) {
        const existing = this.pendingLiterals.get(chunk.id);
        if (existing) {
          existing.literals.push(...literals);
        } else {
          this.pendingLiterals.set(chunk.id, { filepath, literals });
        }
      }
    }

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

    const updatedFilepaths: string[] = [];

    for (const [filepath, summary] of this.pendingSummaries) {
      this.symbolicIndex.addFileIncremental(summary);
      updatedFilepaths.push(filepath);
    }

    if (updatedFilepaths.length > 0) {
      await this.symbolicIndex.saveIncremental(updatedFilepaths);
    }

    this.literalIndex = new LiteralIndex(indexDir, this.id);
    await this.literalIndex.initialize();

    const indexedFilepaths = new Set<string>();
    for (const filepath of this.pendingSummaries.keys()) {
      indexedFilepaths.add(filepath);
    }
    for (const { filepath } of this.pendingLiterals.values()) {
      indexedFilepaths.add(filepath);
    }

    for (const filepath of indexedFilepaths) {
      this.literalIndex.removeFile(filepath);
    }

    for (const [chunkId, { filepath, literals }] of this.pendingLiterals) {
      this.literalIndex.addLiterals(chunkId, filepath, literals);
    }

    await this.literalIndex.save();

    this.pendingSummaries.clear();
    this.pendingLiterals.clear();
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

    const { literals: queryLiterals, remainingQuery } =
      parseQueryLiterals(query);

    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);
    const symbolicIndex = new SymbolicIndex(indexDir, this.id);

    const literalIndex = new LiteralIndex(indexDir, this.id);
    let literalMatchMap = new Map<string, LiteralMatch[]>();

    try {
      await literalIndex.initialize();
      literalMatchMap = literalIndex.buildMatchMap(queryLiterals);
    } catch {
      // Literal index doesn't exist yet
    }

    let allFiles: string[];

    try {
      await symbolicIndex.initialize();
      allFiles = symbolicIndex.getAllFiles();
    } catch {
      allFiles = await ctx.listIndexedFiles();
    }

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

    const semanticQuery = remainingQuery.trim() || query;
    const expandedQuery = expandQuery(semanticQuery, undefined, {
      maxDepth: 1,
      includeWeak: false,
      maxTerms: 10,
    });

    const queryEmbedding = await getEmbedding(expandedQuery.expandedQueryString);

    const bm25Index = new BM25Index();
    const allChunksData: Array<{
      filepath: string;
      chunk: Chunk;
      embedding: number[];
    }> = [];

    for (const filepath of filesToSearch) {
      const fileIndex = await ctx.loadFileIndex(filepath);
      if (!fileIndex) continue;

      const moduleData = fileIndex.moduleData as unknown as RustModuleData;
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

    const pathBoosts = new Map<string, number>();
    for (const filepath of filesToSearch) {
      const summary = symbolicIndex.getFileSummary(filepath);
      if (summary?.pathContext) {
        let boost = 0;
        const pathCtx = summary.pathContext;

        if (
          pathCtx.domain &&
          queryTerms.some(
            (t) => pathCtx.domain!.includes(t) || t.includes(pathCtx.domain!)
          )
        ) {
          boost += 0.1;
        }

        if (
          pathCtx.layer &&
          queryTerms.some(
            (t) => pathCtx.layer!.includes(t) || t.includes(pathCtx.layer!)
          )
        ) {
          boost += 0.05;
        }

        const segmentMatch = pathCtx.segments.some((seg) =>
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

    const results: SearchResult[] = [];
    const processedChunkIds = new Set<string>();

    for (const { filepath, chunk, embedding } of allChunksData) {
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      const bm25Score = bm25Scores.get(chunk.id) || 0;
      const pathBoost = pathBoosts.get(filepath) || 0;

      const fileTypeBoost = calculateFileTypeBoost(filepath, queryTerms);
      const chunkTypeBoost = calculateChunkTypeBoost(chunk);
      const exportBoost = calculateExportBoost(chunk);
      const additiveBoost =
        pathBoost + fileTypeBoost + chunkTypeBoost + exportBoost;

      const baseScore =
        SEMANTIC_WEIGHT * semanticScore + BM25_WEIGHT * bm25Score;

      const literalMatches = literalMatchMap.get(chunk.id) || [];
      const literalContribution = calculateLiteralContribution(
        literalMatches,
        true
      );
      const boostedScore = applyLiteralBoost(baseScore, literalMatches, true);

      const finalScore = boostedScore + additiveBoost;

      processedChunkIds.add(chunk.id);

      if (
        finalScore >= minScore ||
        bm25Score > 0.3 ||
        literalMatches.length > 0
      ) {
        results.push({
          filepath,
          chunk,
          score: finalScore,
          moduleId: this.id,
          context: {
            semanticScore,
            bm25Score,
            pathBoost,
            fileTypeBoost,
            chunkTypeBoost,
            exportBoost,
            literalMultiplier: literalContribution.multiplier,
            literalMatchType: literalContribution.bestMatchType,
            literalConfidence: literalContribution.bestConfidence,
            literalMatchCount: literalContribution.matchCount,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
