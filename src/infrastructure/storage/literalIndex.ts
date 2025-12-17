/**
 * Literal Index Storage
 *
 * Manages the literal index for exact-match boosting.
 * Handles file I/O for persisting literal data.
 *
 * Structure:
 *   .raggrep/index/<module>/literals/
 *   └── _index.json    (literal → chunk mappings)
 */

import * as fs from "fs/promises";
import * as path from "path";
import type {
  ExtractedLiteral,
  DetectedLiteral,
  LiteralMatch,
  LiteralIndexData,
  LiteralIndexEntry,
  LiteralType,
  LiteralMatchType,
} from "../../domain/entities/literal";

/**
 * Literal Index Manager
 *
 * Manages the literal index for exact-match boosting.
 * Provides O(1) lookup for literal matches.
 *
 * Now also supports vocabulary-based search for partial matching:
 * - Store vocabulary words extracted from literals
 * - Search by vocabulary words to find partial matches
 */
export class LiteralIndex {
  private indexPath: string;
  private moduleId: string;

  /**
   * In-memory index: lowercase literal value → entries
   */
  private entries: Map<string, LiteralIndexEntry[]> = new Map();

  /**
   * Vocabulary index: vocabulary word → literal values that contain it
   * Used for partial matching (e.g., "user" → ["getUserById", "fetchUserData"])
   */
  private vocabularyIndex: Map<string, Set<string>> = new Map();

  /**
   * Schema version for compatibility checking.
   */
  private static readonly VERSION = "1.1.0"; // Updated for vocabulary support

  constructor(indexDir: string, moduleId: string) {
    this.indexPath = path.join(indexDir, "index", moduleId, "literals");
    this.moduleId = moduleId;
  }

  /**
   * Initialize the literal index.
   * Attempts to load from disk, creates empty index if not found.
   */
  async initialize(): Promise<void> {
    try {
      await this.load();
      this.rebuildVocabularyIndex();
    } catch {
      // Create empty index
      this.entries = new Map();
      this.vocabularyIndex = new Map();
    }
  }

  /**
   * Rebuild the vocabulary index from entries.
   * Called after loading from disk.
   */
  private rebuildVocabularyIndex(): void {
    this.vocabularyIndex.clear();

    for (const [literalKey, entries] of this.entries) {
      for (const entry of entries) {
        if (entry.vocabulary) {
          for (const word of entry.vocabulary) {
            const wordLower = word.toLowerCase();
            const literals = this.vocabularyIndex.get(wordLower) || new Set();
            literals.add(literalKey);
            this.vocabularyIndex.set(wordLower, literals);
          }
        }
      }
    }
  }

  /**
   * Add literals from a chunk to the index.
   *
   * @param chunkId - Unique identifier for the chunk
   * @param filepath - Path to the file containing the chunk
   * @param literals - Extracted literals from the chunk
   */
  addLiterals(
    chunkId: string,
    filepath: string,
    literals: ExtractedLiteral[]
  ): void {
    for (const literal of literals) {
      const key = literal.value.toLowerCase();
      const existingEntries = this.entries.get(key) || [];

      // Check if this chunk already has an entry for this literal
      const existingIndex = existingEntries.findIndex(
        (e) => e.chunkId === chunkId
      );

      const newEntry: LiteralIndexEntry = {
        chunkId,
        filepath,
        originalCasing: literal.value,
        type: literal.type,
        matchType: literal.matchType,
        vocabulary: literal.vocabulary,
      };

      // Update vocabulary index
      if (literal.vocabulary) {
        for (const word of literal.vocabulary) {
          const wordLower = word.toLowerCase();
          const literals = this.vocabularyIndex.get(wordLower) || new Set();
          literals.add(key);
          this.vocabularyIndex.set(wordLower, literals);
        }
      }

      if (existingIndex >= 0) {
        // Update existing entry (prefer definition over reference)
        const existing = existingEntries[existingIndex];
        if (shouldReplaceMatchType(existing.matchType, literal.matchType)) {
          existingEntries[existingIndex] = newEntry;
        }
      } else {
        existingEntries.push(newEntry);
      }

      this.entries.set(key, existingEntries);
    }
  }

  /**
   * Remove all literals for a chunk.
   *
   * @param chunkId - Chunk ID to remove
   */
  removeChunk(chunkId: string): void {
    for (const [key, entries] of this.entries) {
      const filtered = entries.filter((e) => e.chunkId !== chunkId);
      if (filtered.length === 0) {
        this.entries.delete(key);
      } else if (filtered.length !== entries.length) {
        this.entries.set(key, filtered);
      }
    }
  }

  /**
   * Remove all literals for a file.
   * Used when a file is re-indexed or deleted.
   *
   * @param filepath - Filepath to remove all literals for
   * @returns Number of literals removed
   */
  removeFile(filepath: string): number {
    let removed = 0;
    for (const [key, entries] of this.entries) {
      const filtered = entries.filter((e) => e.filepath !== filepath);
      const removedCount = entries.length - filtered.length;
      if (removedCount > 0) {
        removed += removedCount;
        if (filtered.length === 0) {
          this.entries.delete(key);
        } else {
          this.entries.set(key, filtered);
        }
      }
    }
    return removed;
  }

  /**
   * Find matches for query literals.
   *
   * @param queryLiterals - Literals detected in the query
   * @returns Array of matches with chunk IDs and filepaths
   */
  findMatches(queryLiterals: DetectedLiteral[]): LiteralMatch[] {
    const matches: LiteralMatch[] = [];

    for (const queryLiteral of queryLiterals) {
      const key = queryLiteral.value.toLowerCase();
      const entries = this.entries.get(key);

      if (!entries) {
        continue;
      }

      for (const entry of entries) {
        const exactMatch = entry.originalCasing === queryLiteral.value;

        matches.push({
          queryLiteral,
          indexedLiteral: {
            value: entry.originalCasing,
            type: entry.type,
            matchType: entry.matchType,
          },
          chunkId: entry.chunkId,
          filepath: entry.filepath,
          exactMatch,
        });
      }
    }

    return matches;
  }

  /**
   * Get all chunk IDs that contain a specific literal.
   *
   * @param literal - The literal value to search for
   * @returns Array of chunk IDs
   */
  getChunksForLiteral(literal: string): string[] {
    const key = literal.toLowerCase();
    const entries = this.entries.get(key);
    return entries ? entries.map((e) => e.chunkId) : [];
  }

  /**
   * Find literals that contain a specific vocabulary word.
   *
   * @param word - The vocabulary word to search for
   * @returns Array of literal entries that contain this word
   */
  findByVocabulary(word: string): LiteralIndexEntry[] {
    const wordLower = word.toLowerCase();
    const literalKeys = this.vocabularyIndex.get(wordLower);

    if (!literalKeys) {
      return [];
    }

    const results: LiteralIndexEntry[] = [];
    for (const key of literalKeys) {
      const entries = this.entries.get(key);
      if (entries) {
        results.push(...entries);
      }
    }

    return results;
  }

  /**
   * Find matches for query by vocabulary words.
   * Returns literals that contain any of the given vocabulary words.
   *
   * @param vocabularyWords - Words to search for
   * @returns Array of matches with overlap information
   */
  findByVocabularyWords(
    vocabularyWords: string[]
  ): Array<{ entry: LiteralIndexEntry; matchedWords: string[] }> {
    const matchesMap = new Map<
      string,
      { entry: LiteralIndexEntry; matchedWords: Set<string> }
    >();

    for (const word of vocabularyWords) {
      const wordLower = word.toLowerCase();
      const literalKeys = this.vocabularyIndex.get(wordLower);

      if (!literalKeys) continue;

      for (const key of literalKeys) {
        const entries = this.entries.get(key);
        if (!entries) continue;

        for (const entry of entries) {
          const matchKey = `${entry.chunkId}:${entry.originalCasing}`;
          const existing = matchesMap.get(matchKey);

          if (existing) {
            existing.matchedWords.add(wordLower);
          } else {
            matchesMap.set(matchKey, {
              entry,
              matchedWords: new Set([wordLower]),
            });
          }
        }
      }
    }

    return Array.from(matchesMap.values()).map(({ entry, matchedWords }) => ({
      entry,
      matchedWords: Array.from(matchedWords),
    }));
  }

  /**
   * Save the index to disk.
   */
  async save(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.indexPath, { recursive: true });

    // Convert Map to serializable format
    const data: LiteralIndexData = {
      version: LiteralIndex.VERSION,
      entries: Object.fromEntries(this.entries),
    };

    const indexFile = path.join(this.indexPath, "_index.json");
    await fs.writeFile(indexFile, JSON.stringify(data, null, 2));
  }

  /**
   * Load the index from disk.
   */
  async load(): Promise<void> {
    const indexFile = path.join(this.indexPath, "_index.json");
    const content = await fs.readFile(indexFile, "utf-8");
    const data: LiteralIndexData = JSON.parse(content);

    // Version check
    if (data.version !== LiteralIndex.VERSION) {
      console.warn(
        `Literal index version mismatch: expected ${LiteralIndex.VERSION}, got ${data.version}`
      );
    }

    // Convert back to Map
    this.entries = new Map(Object.entries(data.entries));
  }

  /**
   * Check if the index exists on disk.
   */
  async exists(): Promise<boolean> {
    try {
      const indexFile = path.join(this.indexPath, "_index.json");
      await fs.access(indexFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.entries.clear();
    this.vocabularyIndex.clear();
  }

  /**
   * Get the number of unique literals in the index.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Get the total number of literal-to-chunk mappings.
   */
  get totalMappings(): number {
    let count = 0;
    for (const entries of this.entries.values()) {
      count += entries.length;
    }
    return count;
  }

  /**
   * Get all unique literals in the index.
   */
  getAllLiterals(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Build a map from chunk ID to literal matches for a set of query literals.
   * Convenience method for search integration.
   *
   * @param queryLiterals - Literals detected in the query
   * @returns Map from chunk ID to array of matches
   */
  buildMatchMap(queryLiterals: DetectedLiteral[]): Map<string, LiteralMatch[]> {
    const matches = this.findMatches(queryLiterals);
    const matchMap = new Map<string, LiteralMatch[]>();

    for (const match of matches) {
      const existing = matchMap.get(match.chunkId) || [];
      existing.push(match);
      matchMap.set(match.chunkId, existing);
    }

    return matchMap;
  }
}

/**
 * Determine if we should replace an existing match type with a new one.
 * Priority: definition > reference > import
 */
function shouldReplaceMatchType(
  existing: LiteralMatchType,
  incoming: LiteralMatchType
): boolean {
  const priority: Record<LiteralMatchType, number> = {
    definition: 3,
    reference: 2,
    import: 1,
  };
  return priority[incoming] > priority[existing];
}

/**
 * Get the literal index path for a module.
 */
export function getLiteralIndexPath(
  rootDir: string,
  moduleId: string,
  indexDir: string = ".raggrep"
): string {
  return path.join(rootDir, indexDir, "index", moduleId, "literals");
}
