/**
 * Semantic Index Module
 * 
 * Uses local text embeddings for natural language code search.
 * Implements hybrid search combining semantic similarity and BM25 keyword matching.
 * Models are automatically downloaded on first use.
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
import { getEmbeddingConfigFromModule } from '../../utils/config';
import { parseCode, generateChunkId } from './parseCode';

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

export class SemanticModule implements IndexModule {
  readonly id = 'semantic';
  readonly name = 'Semantic Search';
  readonly description = 'Natural language code search using local text embeddings';
  readonly version = '1.0.0';

  private embeddingConfig: EmbeddingConfig | null = null;

  async initialize(config: ModuleConfig): Promise<void> {
    // Extract embedding config from module options
    this.embeddingConfig = getEmbeddingConfigFromModule(config);
    
    // Configure the embedding provider
    configureEmbeddings(this.embeddingConfig);
  }

  async indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null> {
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

    return {
      filepath,
      lastModified: stats.lastModified,
      chunks,
      moduleData,
      references,
    };
  }

  /**
   * Search the semantic index for chunks matching the query.
   * Uses hybrid search combining semantic similarity and BM25 keyword matching.
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

    // Get query embedding for semantic search
    const queryEmbedding = await getEmbedding(query);

    // Get all indexed files
    const indexedFiles = await ctx.listIndexedFiles();
    
    // Build BM25 index for keyword search
    const bm25Index = new BM25Index();
    const chunkMap = new Map<string, { filepath: string; chunk: Chunk }>();
    
    // Collect all chunks and their data
    const allChunksData: Array<{
      filepath: string;
      chunk: Chunk;
      embedding: number[];
    }> = [];

    for (const indexPath of indexedFiles) {
      const fileIndex = await ctx.loadFileIndex(indexPath);
      if (!fileIndex) continue;

      // Apply file pattern filter using actual filepath (which has the extension)
      if (filePatterns && filePatterns.length > 0) {
        const matches = filePatterns.some(pattern => {
          // Simple glob matching for *.ext patterns
          if (pattern.startsWith('*.')) {
            const ext = pattern.slice(1); // Get ".ext"
            return fileIndex.filepath.endsWith(ext);
          }
          return fileIndex.filepath.includes(pattern);
        });
        if (!matches) continue;
      }

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

        // Add to BM25 index
        const bm25Id = chunk.id;
        chunkMap.set(bm25Id, { filepath: fileIndex.filepath, chunk });
        bm25Index.addDocuments([{ id: bm25Id, content: chunk.content }]);
      }
    }

    // Perform BM25 search
    const bm25Results = bm25Index.search(query, topK * 3); // Get more for merging
    const bm25Scores = new Map<string, number>();
    
    // Normalize BM25 scores to 0-1 range
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
