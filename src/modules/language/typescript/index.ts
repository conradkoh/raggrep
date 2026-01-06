/**
 * TypeScript/JavaScript Language Index Module
 *
 * Provides TypeScript/JavaScript-aware code search using:
 * - AST parsing via TypeScript Compiler API
 * - Local text embeddings for semantic similarity
 * - BM25 keyword matching for fast filtering
 *
 * Supported file types: .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts
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
import {
  cosineSimilarity,
  BM25Index,
  normalizeScore,
  extractKeywords,
  parsePathContext,
  formatPathContextForEmbedding,
  calculateFileTypeBoost,
  extractQueryTerms,
  // Literal boosting
  parseQueryLiterals,
  extractLiterals,
  calculateLiteralContribution,
  applyLiteralBoost,
  LITERAL_SCORING_CONSTANTS,
  // Vocabulary extraction for query
  extractQueryVocabulary,
  calculateVocabularyMatch,
  // Structured Semantic Expansion
  expandQuery,
  // Content phrase matching
  calculatePhraseMatch,
  PHRASE_MATCH_CONSTANTS,
} from "../../../domain/services";
import {
  getEmbeddingConfigFromModule,
  getRaggrepDir,
} from "../../../infrastructure/config";
import { parseTypeScriptCode, generateChunkId } from "./parseCode";
import { SymbolicIndex, LiteralIndex } from "../../../infrastructure/storage";
import type { EmbeddingConfig, Logger } from "../../../domain/ports";
import type {
  FileSummary,
  ExtractedLiteral,
  LiteralMatch,
} from "../../../domain/entities";

/** Default minimum similarity score for search results */
export const DEFAULT_MIN_SCORE = 0.15;

/** Default number of results to return */
export const DEFAULT_TOP_K = 10;

/** Weight for semantic similarity in hybrid scoring (0-1) */
const SEMANTIC_WEIGHT = 0.6;

/** Weight for BM25 keyword matching in hybrid scoring (0-1) */
const BM25_WEIGHT = 0.25;

/** Weight for vocabulary matching in hybrid scoring (0-1) */
const VOCAB_WEIGHT = 0.15;

/** Minimum vocabulary overlap score to bypass minScore filter */
const VOCAB_THRESHOLD = 0.4;

/** File extensions supported by this module */
export const TYPESCRIPT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
];

/**
 * Check if a file is supported by this module.
 */
export function isTypeScriptFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return TYPESCRIPT_EXTENSIONS.includes(ext);
}

// Re-export for module interface
export const supportsFile = isTypeScriptFile;

/**
 * Calculate boost based on chunk type.
 * Function/class/interface chunks rank higher than generic blocks.
 */
function calculateChunkTypeBoost(chunk: Chunk): number {
  switch (chunk.type) {
    case "function":
      return 0.05;
    case "class":
    case "interface":
      return 0.04;
    case "type":
    case "enum":
      return 0.03;
    case "variable":
      return 0.02;
    case "file":
    case "block":
    default:
      return 0;
  }
}

/**
 * Calculate boost for exported symbols.
 * Public APIs are more likely to be what users are searching for.
 */
function calculateExportBoost(chunk: Chunk): number {
  return chunk.isExported ? 0.03 : 0;
}

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

  supportsFile(filepath: string): boolean {
    return isTypeScriptFile(filepath);
  }

  private embeddingConfig: EmbeddingConfig | null = null;
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
    // Extract embedding config from module options
    this.embeddingConfig = getEmbeddingConfigFromModule(config);

    // Extract logger from module options (passed from indexer)
    this.logger = config.options?.logger as Logger | undefined;

    // Add logger to embedding config
    if (this.logger) {
      this.embeddingConfig = {
        ...this.embeddingConfig,
        logger: this.logger,
      };
    }

    // Configure the embedding provider
    configureEmbeddings(this.embeddingConfig);

    // Clear pending data for fresh indexing
    this.pendingSummaries.clear();
    this.pendingLiterals.clear();
  }

  async indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null> {
    // Only process TypeScript/JavaScript files
    if (!isTypeScriptFile(filepath)) {
      return null;
    }

    // Store rootDir for finalize
    this.rootDir = ctx.rootDir;

    // Parse code into chunks using TypeScript AST
    const parsedChunks = parseTypeScriptCode(content, filepath);

    if (parsedChunks.length === 0) {
      return null;
    }

    // Parse path context for structural awareness
    const pathContext = parsePathContext(filepath);
    const pathPrefix = formatPathContextForEmbedding(pathContext);

    // Check if we should include full file chunk
    // Include when:
    // 1. Config option is enabled (future: add to module config)
    // 2. We have multiple semantic chunks (full file provides broad context)
    const includeFullFileChunk = parsedChunks.length > 1;

    // Prepare all chunks for embedding (including optional full file chunk)
    const allParsedChunks = [...parsedChunks];

    // Add full file chunk if requested
    if (includeFullFileChunk) {
      const lines = content.split("\n");
      allParsedChunks.unshift({
        content,
        startLine: 1,
        endLine: lines.length,
        type: "file" as const,
        name: path.basename(filepath),
        isExported: false,
      });
    }

    // Generate embeddings for all chunks with path context
    // Prepending path context helps the embedding model understand file structure
    const chunkContents = allParsedChunks.map((c) => {
      // For named chunks, include the name for better embedding
      const namePrefix = c.name ? `${c.name}: ` : "";
      return `${pathPrefix} ${namePrefix}${c.content}`;
    });
    const embeddings = await getEmbeddings(chunkContents);

    // Create chunks with all metadata
    const chunks: Chunk[] = allParsedChunks.map((pc) => ({
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
    // Use original parsedChunks (not allParsedChunks) to avoid counting file chunk
    const chunkTypes = [
      ...new Set(parsedChunks.map((pc) => pc.type)),
    ] as ChunkType[];
    const exports = parsedChunks
      .filter((pc) => pc.isExported && pc.name)
      .map((pc) => pc.name!);

    // Extract keywords from semantic chunks + path keywords
    // (Skip full file chunk to avoid duplication)
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

    // Extract literals from each chunk for literal boosting
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
      references,
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
    // (both from summaries for any indexed files and from literals for chunks with names)
    const indexedFilepaths = new Set<string>();
    for (const filepath of this.pendingSummaries.keys()) {
      indexedFilepaths.add(filepath);
    }
    for (const { filepath } of this.pendingLiterals.values()) {
      indexedFilepaths.add(filepath);
    }

    // Remove old literals for all files that were re-indexed
    // This ensures stale literals (from renamed/deleted functions) are removed
    for (const filepath of indexedFilepaths) {
      this.literalIndex.removeFile(filepath);
    }

    // Add all pending literals (fresh data from this indexing run)
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
   * Search the semantic index for chunks matching the query.
   *
   * Uses a three-source approach:
   * 1. Semantic search with embeddings
   * 2. BM25 keyword search
   * 3. Literal index for exact-match boosting
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

    // Parse query for literals (explicit backticks/quotes and implicit casing)
    const { literals: queryLiterals, remainingQuery } =
      parseQueryLiterals(query);

    // Load symbolic index for BM25 scoring (not filtering)
    const indexDir = getRaggrepDir(ctx.rootDir, ctx.config);
    const symbolicIndex = new SymbolicIndex(indexDir, this.id);

    // Load literal index for exact-match boosting and vocabulary matching
    const literalIndex = new LiteralIndex(indexDir, this.id);
    let literalMatchMap = new Map<string, LiteralMatch[]>();
    let vocabularyScoreMap = new Map<string, number>();

    try {
      await literalIndex.initialize();
      literalMatchMap = literalIndex.buildMatchMap(queryLiterals);

      // Extract vocabulary from query for partial matching
      const queryVocabulary = extractQueryVocabulary(query);

      if (queryVocabulary.length > 0) {
        // Query vocabulary index for chunks with overlapping vocabulary
        const vocabMatches = literalIndex.findByVocabularyWords(queryVocabulary);

        // Calculate vocabulary score for each matched chunk
        for (const { entry, matchedWords } of vocabMatches) {
          // Score is the proportion of query vocabulary that matched
          const vocabScore = matchedWords.length / queryVocabulary.length;

          // Keep the best score if chunk already has a score
          const existingScore = vocabularyScoreMap.get(entry.chunkId) || 0;
          if (vocabScore > existingScore) {
            vocabularyScoreMap.set(entry.chunkId, vocabScore);
          }
        }
      }
    } catch {
      // Literal index doesn't exist yet, continue without it
    }

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
    // Use remaining query (without explicit literals) for semantic search
    const semanticQuery = remainingQuery.trim() || query; // Fall back to full query if empty

    // Apply Structured Semantic Expansion to broaden search recall
    // This adds domain-specific synonyms (function → method, auth → authentication, etc.)
    // Use conservative settings: no weak synonyms, limited max terms
    const expandedQuery = expandQuery(semanticQuery, undefined, {
      maxDepth: 1,
      includeWeak: false, // Only strong and moderate synonyms
      maxTerms: 10, // Conservative limit to avoid diluting specificity
    });

    // Use expanded query for embedding to improve semantic recall
    const queryEmbedding = await getEmbedding(
      expandedQuery.expandedQueryString
    );

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

    // Perform BM25 search at chunk level (use full query for BM25)
    const bm25Results = bm25Index.search(query, topK * 3);
    const bm25Scores = new Map<string, number>();

    for (const result of bm25Results) {
      bm25Scores.set(result.id, normalizeScore(result.score, 3));
    }

    // Extract query terms for path matching and intent detection
    const queryTerms = extractQueryTerms(query);

    // Build path boost map from file summaries
    const pathBoosts = new Map<string, number>();
    for (const filepath of filesToSearch) {
      const summary = symbolicIndex.getFileSummary(filepath);
      if (summary?.pathContext) {
        let boost = 0;
        const pathCtx = summary.pathContext;

        // Check if query terms match domain
        if (
          pathCtx.domain &&
          queryTerms.some(
            (t) => pathCtx.domain!.includes(t) || t.includes(pathCtx.domain!)
          )
        ) {
          boost += 0.1;
        }

        // Check if query terms match layer
        if (
          pathCtx.layer &&
          queryTerms.some(
            (t) => pathCtx.layer!.includes(t) || t.includes(pathCtx.layer!)
          )
        ) {
          boost += 0.05;
        }

        // Check if query terms match path segments
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

    // Calculate hybrid scores for all chunks
    const results: SearchResult[] = [];
    const processedChunkIds = new Set<string>();

    for (const { filepath, chunk, embedding } of allChunksData) {
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      const bm25Score = bm25Scores.get(chunk.id) || 0;
      const vocabScore = vocabularyScoreMap.get(chunk.id) || 0;
      const pathBoost = pathBoosts.get(filepath) || 0;

      // Content phrase matching
      const phraseMatch = calculatePhraseMatch(chunk.content, query);

      // Additional boosts for ranking improvement
      const fileTypeBoost = calculateFileTypeBoost(filepath, queryTerms);
      const chunkTypeBoost = calculateChunkTypeBoost(chunk);
      const exportBoost = calculateExportBoost(chunk);
      const additiveBoost =
        pathBoost + fileTypeBoost + chunkTypeBoost + exportBoost + phraseMatch.boost;

      // Base hybrid score: weighted combination of semantic, BM25, and vocabulary
      const baseScore =
        SEMANTIC_WEIGHT * semanticScore +
        BM25_WEIGHT * bm25Score +
        VOCAB_WEIGHT * vocabScore;

      // Apply literal boosting (multiplicative)
      const literalMatches = literalMatchMap.get(chunk.id) || [];
      const literalContribution = calculateLiteralContribution(
        literalMatches,
        true // hasSemanticOrBm25
      );
      const boostedScore = applyLiteralBoost(baseScore, literalMatches, true);

      // Final score = boosted base score + additive boosts
      const finalScore = boostedScore + additiveBoost;

      processedChunkIds.add(chunk.id);

      if (
        finalScore >= minScore ||
        bm25Score > 0.3 ||
        literalMatches.length > 0 ||
        vocabScore > VOCAB_THRESHOLD || // Include chunks with significant vocabulary overlap
        phraseMatch.isSignificant // Include chunks with exact phrase or high token coverage
      ) {
        results.push({
          filepath,
          chunk,
          score: finalScore,
          moduleId: this.id,
          context: {
            semanticScore,
            bm25Score,
            vocabScore,
            phraseMatch: phraseMatch.exactMatch,
            phraseCoverage: phraseMatch.coverage,
            pathBoost,
            fileTypeBoost,
            chunkTypeBoost,
            exportBoost,
            // Literal boosting context
            literalMultiplier: literalContribution.multiplier,
            literalMatchType: literalContribution.bestMatchType,
            literalConfidence: literalContribution.bestConfidence,
            literalMatchCount: literalContribution.matchCount,
            // Semantic expansion context
            synonymsUsed: expandedQuery.wasExpanded
              ? expandedQuery.expandedTerms
                  .filter((t) => t.source !== "original")
                  .map((t) => t.term)
              : undefined,
          },
        });
      }
    }

    // Add literal-only results (chunks found by literal index but not loaded above)
    // This ensures exact matches always surface even if they weren't in the search scope
    const literalOnlyFiles = new Map<string, LiteralMatch[]>();

    // Group unprocessed literal matches by filepath
    for (const [chunkId, matches] of literalMatchMap) {
      if (processedChunkIds.has(chunkId)) {
        continue;
      }

      // Get filepath from the first match (all matches for same chunkId have same filepath)
      const filepath = matches[0]?.filepath;
      if (!filepath) continue;

      const existing = literalOnlyFiles.get(filepath) || [];
      existing.push(...matches);
      literalOnlyFiles.set(filepath, existing);
    }

    // Load and score literal-only chunks
    for (const [filepath, matches] of literalOnlyFiles) {
      const fileIndex = await ctx.loadFileIndex(filepath);
      if (!fileIndex) continue;

      const moduleData = fileIndex.moduleData as unknown as SemanticModuleData;

      // Group matches by chunkId for this file
      const chunkMatches = new Map<string, LiteralMatch[]>();
      for (const match of matches) {
        const existing = chunkMatches.get(match.chunkId) || [];
        existing.push(match);
        chunkMatches.set(match.chunkId, existing);
      }

      // Find and score each matched chunk
      for (const [chunkId, chunkLiteralMatches] of chunkMatches) {
        if (processedChunkIds.has(chunkId)) continue;

        const chunkIndex = fileIndex.chunks.findIndex((c) => c.id === chunkId);
        if (chunkIndex === -1) continue;

        const chunk = fileIndex.chunks[chunkIndex];
        const embedding = moduleData?.embeddings?.[chunkIndex];

        // Calculate semantic score if embedding available
        let semanticScore = 0;
        if (embedding) {
          semanticScore = cosineSimilarity(queryEmbedding, embedding);
        }

        // BM25 score (chunk wasn't in our search, so typically 0)
        const bm25Score = bm25Scores.get(chunkId) || 0;

        // Vocabulary score
        const vocabScore = vocabularyScoreMap.get(chunkId) || 0;

        // Content phrase matching
        const phraseMatch = calculatePhraseMatch(chunk.content, query);

        // Additional boosts
        const pathBoost = pathBoosts.get(filepath) || 0;
        const fileTypeBoost = calculateFileTypeBoost(filepath, queryTerms);
        const chunkTypeBoost = calculateChunkTypeBoost(chunk);
        const exportBoost = calculateExportBoost(chunk);
        const additiveBoost =
          pathBoost + fileTypeBoost + chunkTypeBoost + exportBoost + phraseMatch.boost;

        // For literal-only results, use literal scoring
        const literalContribution = calculateLiteralContribution(
          chunkLiteralMatches,
          false // hasSemanticOrBm25 = false (literal-only)
        );

        // Use LITERAL_SCORING_CONSTANTS.BASE_SCORE as base for literal-only
        const baseScore =
          semanticScore > 0
            ? SEMANTIC_WEIGHT * semanticScore +
              BM25_WEIGHT * bm25Score +
              VOCAB_WEIGHT * vocabScore
            : LITERAL_SCORING_CONSTANTS.BASE_SCORE;

        const boostedScore = applyLiteralBoost(
          baseScore,
          chunkLiteralMatches,
          semanticScore > 0
        );
        const finalScore = boostedScore + additiveBoost;

        processedChunkIds.add(chunkId);

        results.push({
          filepath,
          chunk,
          score: finalScore,
          moduleId: this.id,
          context: {
            semanticScore,
            bm25Score,
            vocabScore,
            phraseMatch: phraseMatch.exactMatch,
            phraseCoverage: phraseMatch.coverage,
            pathBoost,
            fileTypeBoost,
            chunkTypeBoost,
            exportBoost,
            literalMultiplier: literalContribution.multiplier,
            literalMatchType: literalContribution.bestMatchType,
            literalConfidence: literalContribution.bestConfidence,
            literalMatchCount: literalContribution.matchCount,
            literalOnly: true, // Mark as literal-only result
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
