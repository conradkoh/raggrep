/**
 * Core Index Module
 *
 * Language-agnostic text search using:
 * - Regex-based symbol extraction
 * - BM25 keyword matching
 * - Line-based chunking
 *
 * Index location: .raggrep/index/core/
 *
 * This module provides fast, deterministic search without embeddings.
 * It complements language-specific modules by catching symbol matches.
 */

import * as path from "path";
import * as fs from "fs/promises";
import {
  IndexModule,
  IndexContext,
  SearchContext,
  SearchOptions,
} from "../../types";
import type {
  FileIndex,
  SearchResult,
  Chunk,
  ModuleConfig,
  ChunkType,
} from "../../domain/entities";
import { BM25Index, tokenize, normalizeScore } from "../../domain/services/bm25";
import { getRaggrepDir } from "../../infrastructure/config";
import { extractSymbols, symbolsToKeywords, type ExtractedSymbol } from "./symbols";

/** Default minimum score for core search results */
const DEFAULT_MIN_SCORE = 0.1;

/** Default number of results */
const DEFAULT_TOP_K = 20;

/** Lines per chunk for basic chunking */
const LINES_PER_CHUNK = 50;

/** Overlap between chunks */
const CHUNK_OVERLAP = 10;

/**
 * Core module-specific data stored with file index
 */
export interface CoreModuleData {
  /** Extracted symbols */
  symbols: ExtractedSymbol[];
  /** BM25 tokens for this file */
  tokens: string[];
  [key: string]: unknown;
}

/**
 * Stored symbol index for fast lookup
 */
interface SymbolIndexEntry {
  filepath: string;
  symbols: ExtractedSymbol[];
  tokens: string[];
}

export class CoreModule implements IndexModule {
  readonly id = "core";
  readonly name = "Core Search";
  readonly description = "Language-agnostic text search with symbol extraction";
  readonly version = "1.0.0";

  private symbolIndex: Map<string, SymbolIndexEntry> = new Map();
  private bm25Index: BM25Index | null = null;
  private rootDir: string = "";

  async initialize(_config: ModuleConfig): Promise<void> {
    // Core module needs no initialization
  }

  /**
   * Index a single file.
   */
  async indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null> {
    this.rootDir = ctx.rootDir;

    // Extract symbols using regex
    const symbols = extractSymbols(content);
    const symbolKeywords = symbolsToKeywords(symbols);

    // Tokenize content for BM25
    const contentTokens = tokenize(content);
    const allTokens = [...new Set([...contentTokens, ...symbolKeywords])];

    // Create line-based chunks
    const chunks = this.createChunks(filepath, content, symbols);

    // Get file stats
    const stats = await ctx.getFileStats(filepath);

    // Store in memory for finalize
    this.symbolIndex.set(filepath, {
      filepath,
      symbols,
      tokens: allTokens,
    });

    // Build module data
    const moduleData: CoreModuleData = {
      symbols,
      tokens: allTokens,
    };

    return {
      filepath,
      lastModified: stats.lastModified,
      chunks,
      moduleData,
    };
  }

  /**
   * Create line-based chunks from content.
   */
  private createChunks(
    filepath: string,
    content: string,
    symbols: ExtractedSymbol[]
  ): Chunk[] {
    const lines = content.split("\n");
    const chunks: Chunk[] = [];

    // Create overlapping chunks
    for (let start = 0; start < lines.length; start += LINES_PER_CHUNK - CHUNK_OVERLAP) {
      const end = Math.min(start + LINES_PER_CHUNK, lines.length);
      const chunkLines = lines.slice(start, end);
      const chunkContent = chunkLines.join("\n");

      // Find symbols in this chunk
      const chunkSymbols = symbols.filter(
        (s) => s.line >= start + 1 && s.line <= end
      );

      // Determine chunk type based on symbols
      let chunkType: ChunkType = "block";
      let chunkName: string | undefined;
      let isExported = false;

      if (chunkSymbols.length > 0) {
        const primarySymbol = chunkSymbols[0];
        chunkType = this.symbolTypeToChunkType(primarySymbol.type);
        chunkName = primarySymbol.name;
        isExported = primarySymbol.isExported;
      }

      const chunkId = `${filepath}:${start + 1}-${end}`;

      chunks.push({
        id: chunkId,
        content: chunkContent,
        startLine: start + 1,
        endLine: end,
        type: chunkType,
        name: chunkName,
        isExported,
      });

      // Stop if we've reached the end
      if (end >= lines.length) break;
    }

    return chunks;
  }

  /**
   * Convert symbol type to chunk type.
   */
  private symbolTypeToChunkType(symbolType: string): ChunkType {
    switch (symbolType) {
      case "function":
      case "method":
        return "function";
      case "class":
        return "class";
      case "interface":
        return "interface";
      case "type":
        return "type";
      case "enum":
        return "enum";
      case "variable":
        return "variable";
      default:
        return "block";
    }
  }

  /**
   * Finalize indexing - build BM25 index and save symbol index.
   */
  async finalize(ctx: IndexContext): Promise<void> {
    const config = ctx.config;
    const coreDir = path.join(getRaggrepDir(ctx.rootDir, config), "index", "core");

    // Ensure directory exists
    await fs.mkdir(coreDir, { recursive: true });

    // Build BM25 index from all tokens
    this.bm25Index = new BM25Index();
    for (const [filepath, entry] of this.symbolIndex) {
      this.bm25Index.addDocument(filepath, entry.tokens);
    }

    // Save symbol index
    const symbolIndexData = {
      version: this.version,
      lastUpdated: new Date().toISOString(),
      files: Object.fromEntries(this.symbolIndex),
      bm25Data: this.bm25Index.serialize(),
    };

    await fs.writeFile(
      path.join(coreDir, "symbols.json"),
      JSON.stringify(symbolIndexData, null, 2)
    );

    console.log(`  [Core] Symbol index built with ${this.symbolIndex.size} files`);
  }

  /**
   * Search the index.
   */
  async search(
    query: string,
    ctx: SearchContext,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const config = ctx.config;
    const topK = options?.topK ?? DEFAULT_TOP_K;
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;

    // Load symbol index if not in memory
    if (this.symbolIndex.size === 0) {
      await this.loadSymbolIndex(ctx.rootDir, config);
    }

    if (!this.bm25Index || this.symbolIndex.size === 0) {
      return [];
    }

    // Tokenize query
    const queryTokens = tokenize(query);

    // Get BM25 scores
    const bm25Results = this.bm25Index.search(query, topK * 2);
    const bm25Scores = new Map(bm25Results.map((r) => [r.id, r.score]));

    // Check for symbol name matches (exact or partial)
    const symbolMatches = this.findSymbolMatches(queryTokens);

    // Combine results
    const results: SearchResult[] = [];

    for (const filepath of this.symbolIndex.keys()) {
      const entry = this.symbolIndex.get(filepath)!;
      const bm25Score = bm25Scores.get(filepath) ?? 0;
      const symbolScore = symbolMatches.get(filepath) ?? 0;

      // Skip if no match
      if (bm25Score === 0 && symbolScore === 0) continue;

      // Combined score: symbol matches are highly weighted
      const combinedScore = 0.6 * normalizeScore(bm25Score) + 0.4 * symbolScore;

      if (combinedScore >= minScore) {
        // Load file index to get chunks
        const fileIndex = await ctx.loadFileIndex(filepath);
        if (!fileIndex) continue;

        // Find best matching chunk
        const bestChunk = this.findBestChunk(fileIndex.chunks, queryTokens, entry.symbols);

        results.push({
          filepath,
          chunk: bestChunk,
          score: combinedScore,
          moduleId: this.id,
          context: {
            bm25Score: normalizeScore(bm25Score),
            symbolScore,
          },
        });
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Find symbol name matches for query tokens.
   */
  private findSymbolMatches(queryTokens: string[]): Map<string, number> {
    const matches = new Map<string, number>();

    for (const [filepath, entry] of this.symbolIndex) {
      let matchScore = 0;

      for (const symbol of entry.symbols) {
        const symbolName = symbol.name.toLowerCase();
        const symbolParts = symbolsToKeywords([symbol]);

        for (const token of queryTokens) {
          // Exact match on symbol name
          if (symbolName === token) {
            matchScore += symbol.isExported ? 1.0 : 0.8;
          }
          // Partial match on symbol name
          else if (symbolName.includes(token) || token.includes(symbolName)) {
            matchScore += symbol.isExported ? 0.5 : 0.4;
          }
          // Match on symbol parts (camelCase split)
          else if (symbolParts.some((p) => p === token)) {
            matchScore += symbol.isExported ? 0.3 : 0.2;
          }
        }
      }

      if (matchScore > 0) {
        // Normalize by number of query tokens
        matches.set(filepath, Math.min(1, matchScore / queryTokens.length));
      }
    }

    return matches;
  }

  /**
   * Find the best matching chunk based on query tokens.
   */
  private findBestChunk(
    chunks: Chunk[],
    queryTokens: string[],
    symbols: ExtractedSymbol[]
  ): Chunk {
    let bestChunk = chunks[0];
    let bestScore = 0;

    for (const chunk of chunks) {
      let score = 0;
      const chunkContent = chunk.content.toLowerCase();

      // Score based on query token presence
      for (const token of queryTokens) {
        if (chunkContent.includes(token)) {
          score += 1;
        }
      }

      // Bonus for named chunks matching query
      if (chunk.name) {
        const nameLower = chunk.name.toLowerCase();
        for (const token of queryTokens) {
          if (nameLower.includes(token)) {
            score += 2;
          }
        }
      }

      // Bonus for exported symbols
      if (chunk.isExported) {
        score += 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    return bestChunk;
  }

  /**
   * Load the symbol index from disk.
   */
  private async loadSymbolIndex(rootDir: string, config: any): Promise<void> {
    const coreDir = path.join(getRaggrepDir(rootDir, config), "index", "core");
    const symbolsPath = path.join(coreDir, "symbols.json");

    try {
      const content = await fs.readFile(symbolsPath, "utf-8");
      const data = JSON.parse(content);

      // Restore symbol index
      this.symbolIndex = new Map(Object.entries(data.files));

      // Restore BM25 index
      if (data.bm25Data) {
        this.bm25Index = BM25Index.deserialize(data.bm25Data);
      }
    } catch (error) {
      // Index doesn't exist yet
      this.symbolIndex = new Map();
      this.bm25Index = null;
    }
  }

  async dispose(): Promise<void> {
    this.symbolIndex.clear();
    this.bm25Index = null;
  }
}

