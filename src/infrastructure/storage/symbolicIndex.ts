/**
 * Symbolic Index Storage
 *
 * Manages the keyword-based index for fast file filtering.
 * Handles file I/O for persisting index data.
 *
 * Structure:
 *   .raggrep/index/<module>/symbolic/
 *   ├── _meta.json    (BM25 statistics)
 *   └── <filepath>.json (per-file summaries)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { BM25Index } from "../../domain/services/bm25";
import { extractPathKeywords } from "../../domain/services/keywords";
import type { FileSummary, SymbolicIndexMeta } from "../../domain/entities";

/**
 * Symbolic Index Manager
 *
 * Manages the keyword-based index for fast file filtering.
 */
export class SymbolicIndex {
  private meta: SymbolicIndexMeta | null = null;
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
   * Add or update a file summary
   */
  addFile(summary: FileSummary): void {
    this.fileSummaries.set(summary.filepath, summary);
  }

  /**
   * Remove a file from the index
   */
  removeFile(filepath: string): boolean {
    return this.fileSummaries.delete(filepath);
  }

  /**
   * Build BM25 index from file summaries
   */
  buildBM25Index(): void {
    this.bm25Index = new BM25Index();

    // Add each file's keywords as a document
    for (const [filepath, summary] of this.fileSummaries) {
      const content = [
        ...summary.keywords,
        ...summary.exports,
        ...extractPathKeywords(filepath),
      ].join(" ");

      this.bm25Index.addDocuments([{ id: filepath, content }]);
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
   * Save the index to disk (per-file structure)
   */
  async save(): Promise<void> {
    if (!this.meta) throw new Error("Index not initialized");

    // Update metadata
    this.meta.lastUpdated = new Date().toISOString();
    this.meta.fileCount = this.fileSummaries.size;

    // Ensure symbolic directory exists
    await fs.mkdir(this.symbolicPath, { recursive: true });

    // Save metadata
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

    // Rebuild BM25 index
    this.buildBM25Index();
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

