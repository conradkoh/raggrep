/**
 * Semantic Index Module
 * 
 * Uses local text embeddings for natural language code search.
 * Implements a tiered index system:
 * - Tier 1: Lightweight file summaries with keywords for fast filtering
 * - Tier 2: Full chunk embeddings for semantic similarity
 * 
 * This approach keeps the filesystem-based design while enabling
 * efficient search by only loading relevant files.
 */

import * as path from 'path';
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
} from '../../types';
import {
  getEmbeddings,
  getEmbedding,
  cosineSimilarity,
  configureEmbeddings,
  EmbeddingConfig,
  getEmbeddingConfig,
} from '../../utils/embeddings';
import { BM25Index, normalizeScore } from '../../utils/bm25';
import { getEmbeddingConfigFromModule, getRaggrepDir } from '../../utils/config';
import { parseCode, generateChunkId } from './parseCode';
import { SymbolicIndex, FileSummary, extractKeywords } from '../../utils/tieredIndex';

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

/** Number of candidate files to retrieve from Tier 1 before loading Tier 2 */
const TIER1_CANDIDATE_MULTIPLIER = 3;

export class SemanticModule implements IndexModule {
  readonly id = 'semantic';
  readonly name = 'Semantic Search';
  readonly description = 'Natural language code search using local text embeddings';
  readonly version = '1.0.0';

  private embeddingConfig: EmbeddingConfig | null = null;
  private symbolicIndex: SymbolicIndex | null = null;
  private pendingSummaries: Map<string, FileSummary> = new Map();
  private rootDir: string = '';

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

    // Generate embeddings for all chunks
    const chunkContents = parsedChunks.map((c) => c.content);
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
    const chunkTypes = [...new Set(parsedChunks.map(pc => pc.type))] as ChunkType[];
    const exports = parsedChunks
      .filter(pc => pc.isExported && pc.name)
      .map(pc => pc.name!);
    
    // Extract keywords from all chunks
    const allKeywords = new Set<string>();
    for (const pc of parsedChunks) {
      const keywords = extractKeywords(pc.content, pc.name);
      keywords.forEach(k => allKeywords.add(k));
    }

    const fileSummary: FileSummary = {
      filepath,
      chunkCount: chunks.length,
      chunkTypes,
      keywords: Array.from(allKeywords),
      exports,
      lastModified: stats.lastModified,
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
    
    console.log(`  Symbolic index built with ${this.pendingSummaries.size} file summaries`);
    
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
    const { topK = DEFAULT_TOP_K, minScore = DEFAULT_MIN_SCORE, filePatterns } = options;

    // Load symbolic index for candidate filtering
    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);
    const symbolicIndex = new SymbolicIndex(indexDir, this.id);
    
    let candidateFiles: string[];
    
    try {
      await symbolicIndex.initialize();
      
      // Use BM25 keyword search on symbolic index to find candidate files
      const maxCandidates = topK * TIER1_CANDIDATE_MULTIPLIER;
      candidateFiles = symbolicIndex.findCandidates(query, maxCandidates);
      
      // If no candidates found via BM25, fall back to all files
      if (candidateFiles.length === 0) {
        candidateFiles = symbolicIndex.getAllFiles();
      }
    } catch {
      // Symbolic index doesn't exist, fall back to loading all files
      candidateFiles = await ctx.listIndexedFiles();
    }

    // Apply file pattern filter
    if (filePatterns && filePatterns.length > 0) {
      candidateFiles = candidateFiles.filter(filepath => {
        return filePatterns.some(pattern => {
          if (pattern.startsWith('*.')) {
            const ext = pattern.slice(1);
            return filepath.endsWith(ext);
          }
          return filepath.includes(pattern);
        });
      });
    }

    // Get query embedding for semantic search
    const queryEmbedding = await getEmbedding(query);

    // Tier 2: Load only candidate files and compute scores
    const bm25Index = new BM25Index();
    const allChunksData: Array<{
      filepath: string;
      chunk: Chunk;
      embedding: number[];
    }> = [];

    for (const filepath of candidateFiles) {
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

    // Calculate hybrid scores for all chunks
    const results: SearchResult[] = [];

    for (const { filepath, chunk, embedding } of allChunksData) {
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      const bm25Score = bm25Scores.get(chunk.id) || 0;
      
      // Hybrid score: weighted combination of semantic and BM25
      const hybridScore = (SEMANTIC_WEIGHT * semanticScore) + (BM25_WEIGHT * bm25Score);

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
      if (importPath.startsWith('.')) {
        const dir = path.dirname(filepath);
        const resolved = path.normalize(path.join(dir, importPath));
        references.push(resolved);
      }
    }

    while ((match = requireRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        const dir = path.dirname(filepath);
        const resolved = path.normalize(path.join(dir, importPath));
        references.push(resolved);
      }
    }

    return references;
  }
}
