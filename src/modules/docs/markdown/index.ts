/**
 * Markdown Documentation Index Module
 *
 * Provides Markdown file search using:
 * - Heading-based section parsing
 * - Local text embeddings for semantic similarity
 * - Structure-aware chunking
 *
 * Supported file types: .md
 *
 * Index location: .raggrep/index/docs/markdown/
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
  generateChunkId,
} from "../../../domain/services";
import {
  getEmbeddingConfigFromModule,
  getRaggrepDir,
} from "../../../infrastructure/config";
import { SymbolicIndex } from "../../../infrastructure/storage";
import type { EmbeddingConfig, Logger } from "../../../domain/ports";
import type { FileSummary, ChunkType } from "../../../domain/entities";

/** Default minimum similarity score for search results */
export const DEFAULT_MIN_SCORE = 0.15;

/** Default number of results to return */
export const DEFAULT_TOP_K = 10;

/** Weight for semantic similarity in hybrid scoring (0-1) */
const SEMANTIC_WEIGHT = 0.7;

/** Weight for BM25 keyword matching in hybrid scoring (0-1) */
const BM25_WEIGHT = 0.3;

/** File extensions supported by this module */
export const MARKDOWN_EXTENSIONS = [".md", ".txt"];

/**
 * Check if a file is supported by this module.
 */
export function isMarkdownFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return MARKDOWN_EXTENSIONS.includes(ext);
}

// Re-export for module interface
export const supportsFile = isMarkdownFile;

/**
 * Represents a parsed section from a Markdown document.
 */
interface MarkdownSection {
  /** The heading text (without #) */
  heading: string;
  /** The heading level (1-6) */
  level: number;
  /** The content under this heading */
  content: string;
  /** 1-based start line number */
  startLine: number;
  /** 1-based end line number */
  endLine: number;
}

/**
 * Parse Markdown content into sections based on headings.
 */
function parseMarkdownSections(content: string): MarkdownSection[] {
  const lines = content.split("\n");
  const sections: MarkdownSection[] = [];

  let currentSection: MarkdownSection | null = null;
  let currentContent: string[] = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join("\n").trim();
        currentSection.endLine = i; // Previous line
        if (currentSection.content || currentSection.heading) {
          sections.push(currentSection);
        }
      } else if (currentContent.length > 0) {
        // Content before first heading
        sections.push({
          heading: "",
          level: 0,
          content: currentContent.join("\n").trim(),
          startLine: 1,
          endLine: i,
        });
      }

      // Start new section
      currentSection = {
        heading: headingMatch[2],
        level: headingMatch[1].length,
        content: "",
        startLine: i + 1,
        endLine: lines.length,
      };
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentSection) {
    currentSection.content = currentContent.join("\n").trim();
    currentSection.endLine = lines.length;
    if (currentSection.content || currentSection.heading) {
      sections.push(currentSection);
    }
  } else if (currentContent.length > 0) {
    // No headings at all
    sections.push({
      heading: "",
      level: 0,
      content: currentContent.join("\n").trim(),
      startLine: 1,
      endLine: lines.length,
    });
  }

  return sections;
}

/**
 * Extract keywords from Markdown content.
 */
function extractMarkdownKeywords(content: string): string[] {
  const keywords: string[] = [];

  // Extract headings
  const headingMatches = content.matchAll(/^#{1,6}\s+(.+)$/gm);
  for (const match of headingMatches) {
    const heading = match[1].toLowerCase();
    const words = heading.split(/\s+/).filter((w) => w.length > 2);
    keywords.push(...words);
  }

  // Extract bold/emphasized text
  const emphasisMatches = content.matchAll(/\*\*(.+?)\*\*|\*(.+?)\*/g);
  for (const match of emphasisMatches) {
    const text = (match[1] || match[2] || "").toLowerCase();
    const words = text.split(/\s+/).filter((w) => w.length > 2);
    keywords.push(...words);
  }

  // Extract code blocks (inline)
  const codeMatches = content.matchAll(/`([^`]+)`/g);
  for (const match of codeMatches) {
    const code = match[1].toLowerCase();
    if (code.length > 2 && code.length < 50) {
      keywords.push(code);
    }
  }

  // Extract links
  const linkMatches = content.matchAll(/\[([^\]]+)\]/g);
  for (const match of linkMatches) {
    const text = match[1].toLowerCase();
    const words = text.split(/\s+/).filter((w) => w.length > 2);
    keywords.push(...words);
  }

  return [...new Set(keywords)];
}

/**
 * Module-specific data stored alongside file index
 */
export interface MarkdownModuleData {
  embeddings: number[][];
  embeddingModel: string;
  headings: string[];
  [key: string]: unknown;
}

export class MarkdownModule implements IndexModule {
  readonly id = "docs/markdown";
  readonly name = "Markdown Search";
  readonly description =
    "Markdown documentation search with section-aware indexing";
  readonly version = "1.0.0";

  supportsFile(filepath: string): boolean {
    return isMarkdownFile(filepath);
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
    // Only process Markdown files
    if (!isMarkdownFile(filepath)) {
      return null;
    }

    this.rootDir = ctx.rootDir;

    // Parse Markdown into sections
    const sections = parseMarkdownSections(content);

    if (sections.length === 0) {
      return null;
    }

    // Generate embeddings for sections
    const chunkContents = sections.map((s) => {
      const filename = path.basename(filepath);
      const headingContext = s.heading ? `${s.heading}: ` : "";
      return `${filename} ${headingContext}${s.content}`;
    });
    const embeddings = await getEmbeddings(chunkContents);

    // Create chunks from sections
    const chunks: Chunk[] = sections.map((section, i) => ({
      id: generateChunkId(filepath, section.startLine, section.endLine),
      content: section.heading
        ? `## ${section.heading}\n\n${section.content}`
        : section.content,
      startLine: section.startLine,
      endLine: section.endLine,
      type: "block" as ChunkType,
      name: section.heading || undefined,
    }));

    // Extract headings for metadata
    const headings = sections.filter((s) => s.heading).map((s) => s.heading);

    const stats = await ctx.getFileStats(filepath);
    const currentConfig = getEmbeddingConfig();

    const moduleData: MarkdownModuleData = {
      embeddings,
      embeddingModel: currentConfig.model,
      headings,
    };

    // Build file summary
    const keywords = extractMarkdownKeywords(content);

    const fileSummary: FileSummary = {
      filepath,
      chunkCount: chunks.length,
      chunkTypes: ["block"],
      keywords,
      exports: headings, // Use headings as "exports" for searchability
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

    // Filter to Markdown files only
    let filesToSearch = allFiles.filter((f) => isMarkdownFile(f));

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

      const moduleData = fileIndex.moduleData as unknown as MarkdownModuleData;
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

      // Documentation files get a small boost for documentation-intent queries
      let docBoost = 0;
      if (
        queryTerms.some((t) =>
          [
            "docs",
            "documentation",
            "readme",
            "guide",
            "how",
            "what",
            "explain",
          ].includes(t)
        )
      ) {
        docBoost = 0.05;
      }

      const hybridScore =
        SEMANTIC_WEIGHT * semanticScore + BM25_WEIGHT * bm25Score + docBoost;

      if (hybridScore >= minScore || bm25Score > 0.3) {
        results.push({
          filepath,
          chunk,
          score: hybridScore,
          moduleId: this.id,
          context: {
            semanticScore,
            bm25Score,
            docBoost,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
