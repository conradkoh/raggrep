// Semantic Index Module
// Uses local text embeddings for natural language code search
// Models are automatically downloaded on first use

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
import { getEmbeddingConfigFromModule } from '../../utils/config';
import { parseCode, generateChunkId } from './parseCode';

/** Default minimum similarity score for search results */
export const DEFAULT_MIN_SCORE = 0.15;

/** Default number of results to return */
export const DEFAULT_TOP_K = 10;

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

    // Create chunks
    const chunks: Chunk[] = parsedChunks.map((pc) => ({
      id: generateChunkId(filepath, pc.startLine, pc.endLine),
      content: pc.content,
      startLine: pc.startLine,
      endLine: pc.endLine,
      type: pc.type,
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
   * Search the semantic index for chunks matching the query
   * @param query - Natural language search query
   * @param ctx - Search context with index access
   * @param options - Search options (topK, minScore)
   * @returns Array of search results sorted by relevance
   */
  async search(
    query: string,
    ctx: SearchContext,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { topK = DEFAULT_TOP_K, minScore = DEFAULT_MIN_SCORE } = options;

    // Get query embedding
    const queryEmbedding = await getEmbedding(query);

    // Get all indexed files
    const indexedFiles = await ctx.listIndexedFiles();
    const results: SearchResult[] = [];

    for (const filepath of indexedFiles) {
      const fileIndex = await ctx.loadFileIndex(filepath);
      if (!fileIndex) continue;

      const moduleData = fileIndex.moduleData as unknown as SemanticModuleData;
      if (!moduleData?.embeddings) continue;

      // Compare each chunk's embedding with query
      for (let i = 0; i < fileIndex.chunks.length; i++) {
        const chunk = fileIndex.chunks[i];
        const embedding = moduleData.embeddings[i];

        if (!embedding) continue;

        const score = cosineSimilarity(queryEmbedding, embedding);

        if (score >= minScore) {
          results.push({
            filepath: fileIndex.filepath,
            chunk,
            score,
            moduleId: this.id,
          });
        }
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
