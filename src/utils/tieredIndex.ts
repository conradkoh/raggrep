/**
 * Tiered Index System
 * 
 * Tier 1: Lightweight file-level summaries for fast filtering
 * Tier 2: Full chunk embeddings (existing JSON files)
 * 
 * This approach keeps the filesystem-based design while enabling
 * efficient search by only loading relevant files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BM25Index } from '../domain/services/bm25';
import { extractKeywords, extractPathKeywords } from '../domain/services/keywords';
import type { FileSummary, Tier1Manifest } from '../domain/entities';

// Re-export types and functions for backwards compatibility
export type { FileSummary, Tier1Manifest } from '../domain/entities';
export { extractKeywords } from '../domain/services/keywords';

/**
 * Tier 1 Index Manager
 * 
 * Handles loading, saving, and querying the Tier 1 manifest.
 */
export class Tier1Index {
  private manifest: Tier1Manifest | null = null;
  private bm25Index: BM25Index | null = null;
  private manifestPath: string;

  constructor(indexDir: string, moduleId: string) {
    this.manifestPath = path.join(indexDir, 'index', moduleId, 'tier1.json');
  }

  /**
   * Initialize or load the Tier 1 index
   */
  async initialize(moduleId: string): Promise<void> {
    try {
      await this.load();
    } catch {
      // Create empty manifest
      this.manifest = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        moduleId,
        files: {},
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
    if (!this.manifest) throw new Error('Index not initialized');
    this.manifest.files[summary.filepath] = summary;
  }

  /**
   * Remove a file from the index
   */
  removeFile(filepath: string): boolean {
    if (!this.manifest) return false;
    if (this.manifest.files[filepath]) {
      delete this.manifest.files[filepath];
      return true;
    }
    return false;
  }

  /**
   * Build BM25 index from file summaries
   */
  buildBM25Index(): void {
    if (!this.manifest) throw new Error('Index not initialized');
    
    this.bm25Index = new BM25Index();
    
    // Add each file's keywords as a document
    for (const [filepath, summary] of Object.entries(this.manifest.files)) {
      const content = [
        ...summary.keywords,
        ...summary.exports,
        // Add filepath parts as keywords too
        ...extractPathKeywords(filepath),
      ].join(' ');
      
      this.bm25Index.addDocuments([{ id: filepath, content }]);
    }
    
    // Store BM25 statistics in manifest for persistence
    this.manifest.bm25Data.totalDocs = Object.keys(this.manifest.files).length;
  }

  /**
   * Find candidate files using BM25 keyword search
   * @param query - Search query
   * @param maxCandidates - Maximum number of candidates to return
   * @returns Array of filepaths sorted by relevance
   */
  findCandidates(query: string, maxCandidates: number = 20): string[] {
    if (!this.bm25Index || !this.manifest) {
      return Object.keys(this.manifest?.files || {});
    }
    
    const results = this.bm25Index.search(query, maxCandidates);
    return results.map(r => r.id);
  }

  /**
   * Get all file paths in the index
   */
  getAllFiles(): string[] {
    return Object.keys(this.manifest?.files || {});
  }

  /**
   * Get summary for a specific file
   */
  getFileSummary(filepath: string): FileSummary | undefined {
    return this.manifest?.files[filepath];
  }

  /**
   * Save the index to disk
   */
  async save(): Promise<void> {
    if (!this.manifest) throw new Error('Index not initialized');
    
    this.manifest.lastUpdated = new Date().toISOString();
    
    await fs.mkdir(path.dirname(this.manifestPath), { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }

  /**
   * Load the index from disk
   */
  async load(): Promise<void> {
    const content = await fs.readFile(this.manifestPath, 'utf-8');
    this.manifest = JSON.parse(content);
    
    // Rebuild BM25 index from loaded data
    this.buildBM25Index();
  }

  /**
   * Check if the index exists on disk
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.manifestPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the number of indexed files
   */
  get size(): number {
    return Object.keys(this.manifest?.files || {}).length;
  }

  /**
   * Clear the index
   */
  clear(): void {
    if (this.manifest) {
      this.manifest.files = {};
      this.manifest.bm25Data = {
        avgDocLength: 0,
        documentFrequencies: {},
        totalDocs: 0,
      };
    }
    this.bm25Index = new BM25Index();
  }
}

/**
 * Get Tier 1 index path for a module
 */
export function getTier1Path(rootDir: string, moduleId: string, indexDir: string = '.raggrep'): string {
  return path.join(rootDir, indexDir, 'index', moduleId, 'tier1.json');
}
