/**
 * Symbolic Index Storage
 *
 * Manages the keyword-based index for fast file filtering.
 * Handles file I/O for persisting index data.
 *
 * Structure:
 *   .raggrep/index/<module>/symbolic/
 *   ├── _meta.json    (BM25 statistics + serialized BM25 data)
 *   └── <filepath>.json (per-file summaries)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { BM25Index, tokenize } from "../../domain/services/bm25";
import { extractPathKeywords } from "../../domain/services/keywords";
import type { FileSummary, SymbolicIndexMeta } from "../../domain/entities";

/**
 * Extended metadata that includes serialized BM25 index
 */
interface SymbolicIndexMetaWithBM25 extends SymbolicIndexMeta {
  /** Serialized BM25 index data for fast loading */
  bm25Serialized?: {
    documents: Record<string, string[]>;
    avgDocLength: number;
    documentFrequencies: Record<string, number>;
    totalDocs: number;
  };
}

/**
 * Symbolic Index Manager
 *
 * Manages the keyword-based index for fast file filtering.
 * Supports incremental updates to avoid full rebuilds.
 */
export class SymbolicIndex {
  private meta: SymbolicIndexMetaWithBM25 | null = null;
  private fileSummaries: Map<string, FileSummary> = new Map();
  private bm25Index: BM25Index | null = null;
  private symbolicPath: string;
  private moduleId: string;

  constructor(indexDir: string, moduleId: string) {
    this.symbolicPath = path.join(indexDir, "index", moduleId, "symbolic");
    this.moduleId = moduleId;
  }

  /**
   * Initialize or load the symbolic index
   */
  async initialize(): Promise<void> {
    try {
      await this.load();
    } catch {
      // Create empty metadata
      this.meta = {
        version: "1.0.0",
        lastUpdated: new Date().toISOString(),
        moduleId: this.moduleId,
        fileCount: 0,
        bm25Data: {
          avgDocLength: 0,
          documentFrequencies: {},
          totalDocs: 0,
        },
      };
      this.bm25Index = new BM25Index();
    }
  }

  /**
   * Add or update a file summary (for batch operations, use with buildBM25Index)
   */
  addFile(summary: FileSummary): void {
    this.fileSummaries.set(summary.filepath, summary);
  }

  /**
   * Add or update a file summary with incremental BM25 update.
   * Use this for incremental indexing instead of addFile + buildBM25Index.
   */
  addFileIncremental(summary: FileSummary): void {
    const filepath = summary.filepath;
    const oldSummary = this.fileSummaries.get(filepath);

    // Update the summary
    this.fileSummaries.set(filepath, summary);

    // Update BM25 incrementally
    if (this.bm25Index) {
      // If file existed before, remove its old BM25 entry
      if (oldSummary) {
        this.bm25Index.removeDocument(filepath);
      }

      // Add the new entry
      const tokens = this.getTokensForSummary(filepath, summary);
      this.bm25Index.addDocument(filepath, tokens);
    }
  }

  /**
   * Remove a file from the index (for batch operations)
   */
  removeFile(filepath: string): boolean {
    return this.fileSummaries.delete(filepath);
  }

  /**
   * Remove a file from the index with incremental BM25 update.
   * Use this for incremental indexing.
   */
  removeFileIncremental(filepath: string): boolean {
    const existed = this.fileSummaries.delete(filepath);

    // Update BM25 incrementally
    if (existed && this.bm25Index) {
      this.bm25Index.removeDocument(filepath);
    }

    return existed;
  }

  /**
   * Get tokens for a file summary (for BM25 indexing)
   */
  private getTokensForSummary(filepath: string, summary: FileSummary): string[] {
    const content = [
      ...summary.keywords,
      ...summary.exports,
      ...extractPathKeywords(filepath),
    ].join(" ");
    return tokenize(content);
  }

  /**
   * Build BM25 index from file summaries (full rebuild)
   */
  buildBM25Index(): void {
    this.bm25Index = new BM25Index();

    // Add each file's keywords as a document
    for (const [filepath, summary] of this.fileSummaries) {
      const tokens = this.getTokensForSummary(filepath, summary);
      this.bm25Index.addDocument(filepath, tokens);
    }

    // Update metadata
    if (this.meta) {
      this.meta.fileCount = this.fileSummaries.size;
      this.meta.bm25Data.totalDocs = this.fileSummaries.size;
    }
  }

  /**
   * Find candidate files using BM25 keyword search
   */
  findCandidates(query: string, maxCandidates: number = 20): string[] {
    if (!this.bm25Index) {
      return Array.from(this.fileSummaries.keys());
    }

    const results = this.bm25Index.search(query, maxCandidates);
    return results.map((r) => r.id);
  }

  /**
   * Get all file paths in the index
   */
  getAllFiles(): string[] {
    return Array.from(this.fileSummaries.keys());
  }

  /**
   * Get summary for a specific file
   */
  getFileSummary(filepath: string): FileSummary | undefined {
    return this.fileSummaries.get(filepath);
  }

  /**
   * Save the index to disk (per-file structure with BM25 serialization)
   */
  async save(): Promise<void> {
    if (!this.meta) throw new Error("Index not initialized");

    // Update metadata
    this.meta.lastUpdated = new Date().toISOString();
    this.meta.fileCount = this.fileSummaries.size;

    // Serialize BM25 index for fast loading
    if (this.bm25Index) {
      this.meta.bm25Serialized = this.bm25Index.serialize();
    }

    // Ensure symbolic directory exists
    await fs.mkdir(this.symbolicPath, { recursive: true });

    // Save metadata (includes serialized BM25)
    const metaPath = path.join(this.symbolicPath, "_meta.json");
    await fs.writeFile(metaPath, JSON.stringify(this.meta, null, 2));

    // Save each file summary
    for (const [filepath, summary] of this.fileSummaries) {
      const summaryPath = this.getFileSummaryPath(filepath);
      await fs.mkdir(path.dirname(summaryPath), { recursive: true });
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    }
  }

  /**
   * Save only the updated file summaries (for incremental saves)
   * @param filepaths - List of filepaths that were updated
   */
  async saveIncremental(filepaths: string[]): Promise<void> {
    if (!this.meta) throw new Error("Index not initialized");

    // Update metadata
    this.meta.lastUpdated = new Date().toISOString();
    this.meta.fileCount = this.fileSummaries.size;

    // Serialize BM25 index
    if (this.bm25Index) {
      this.meta.bm25Serialized = this.bm25Index.serialize();
    }

    // Ensure symbolic directory exists
    await fs.mkdir(this.symbolicPath, { recursive: true });

    // Save metadata (includes serialized BM25)
    const metaPath = path.join(this.symbolicPath, "_meta.json");
    await fs.writeFile(metaPath, JSON.stringify(this.meta, null, 2));

    // Save only the updated file summaries
    for (const filepath of filepaths) {
      const summary = this.fileSummaries.get(filepath);
      if (summary) {
        const summaryPath = this.getFileSummaryPath(filepath);
        await fs.mkdir(path.dirname(summaryPath), { recursive: true });
        await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
      }
    }
  }

  /**
   * Load the index from disk
   */
  async load(): Promise<void> {
    // Load metadata
    const metaPath = path.join(this.symbolicPath, "_meta.json");
    const metaContent = await fs.readFile(metaPath, "utf-8");
    this.meta = JSON.parse(metaContent);

    // Load all file summaries by walking the symbolic directory
    this.fileSummaries.clear();
    await this.loadFileSummariesRecursive(this.symbolicPath);

    // Try to load BM25 from serialized data (fast path)
    if (this.meta?.bm25Serialized) {
      this.bm25Index = BM25Index.deserialize(this.meta.bm25Serialized);
    } else {
      // Fall back to rebuilding if no serialized data
      this.buildBM25Index();
    }
  }

  /**
   * Recursively load file summaries from the symbolic directory
   */
  private async loadFileSummariesRecursive(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await this.loadFileSummariesRecursive(fullPath);
        } else if (entry.name.endsWith(".json") && entry.name !== "_meta.json") {
          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const summary = JSON.parse(content) as FileSummary;
            if (summary.filepath) {
              this.fileSummaries.set(summary.filepath, summary);
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  /**
   * Get the path for a file summary
   */
  private getFileSummaryPath(filepath: string): string {
    const jsonPath = filepath.replace(/\.[^.]+$/, ".json");
    return path.join(this.symbolicPath, jsonPath);
  }

  /**
   * Delete a file summary from disk
   */
  async deleteFileSummary(filepath: string): Promise<void> {
    try {
      await fs.unlink(this.getFileSummaryPath(filepath));
    } catch {
      // Ignore if file doesn't exist
    }
    this.fileSummaries.delete(filepath);
  }

  /**
   * Check if the index exists on disk
   */
  async exists(): Promise<boolean> {
    try {
      const metaPath = path.join(this.symbolicPath, "_meta.json");
      await fs.access(metaPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the number of indexed files
   */
  get size(): number {
    return this.fileSummaries.size;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.fileSummaries.clear();
    if (this.meta) {
      this.meta.fileCount = 0;
      this.meta.bm25Data = {
        avgDocLength: 0,
        documentFrequencies: {},
        totalDocs: 0,
      };
    }
    this.bm25Index = new BM25Index();
  }
}

/**
 * Get the symbolic index path for a module
 */
export function getSymbolicPath(
  rootDir: string,
  moduleId: string,
  indexDir: string = ".raggrep"
): string {
  return path.join(rootDir, indexDir, "index", moduleId, "symbolic");
}

