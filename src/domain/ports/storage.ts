/**
 * Index Storage Port
 * 
 * Abstract interface for storing and retrieving index data.
 * This allows the domain to remain independent of the actual storage implementation.
 */

import type { FileIndex, ModuleManifest, GlobalManifest, Config } from '../entities';
import type { FileSummary, Tier1Manifest } from '../entities';

/**
 * Abstract index storage interface.
 * 
 * Handles persistence of index data (Tier 1 and Tier 2).
 * Implementations might use:
 * - Filesystem (current)
 * - SQLite
 * - IndexedDB (for browser)
 */
export interface IndexStorage {
  // ============================================================================
  // Configuration
  // ============================================================================
  
  /**
   * Load configuration from storage
   */
  loadConfig(): Promise<Config>;
  
  /**
   * Save configuration to storage
   */
  saveConfig(config: Config): Promise<void>;
  
  // ============================================================================
  // Global Manifest
  // ============================================================================
  
  /**
   * Load global manifest
   */
  loadGlobalManifest(): Promise<GlobalManifest | null>;
  
  /**
   * Save global manifest
   */
  saveGlobalManifest(manifest: GlobalManifest): Promise<void>;
  
  // ============================================================================
  // Module Manifest (Tier 2 metadata)
  // ============================================================================
  
  /**
   * Load module manifest
   */
  loadModuleManifest(moduleId: string): Promise<ModuleManifest | null>;
  
  /**
   * Save module manifest
   */
  saveModuleManifest(moduleId: string, manifest: ModuleManifest): Promise<void>;
  
  // ============================================================================
  // Tier 1 Index
  // ============================================================================
  
  /**
   * Load Tier 1 index for a module
   */
  loadTier1Index(moduleId: string): Promise<Tier1Manifest | null>;
  
  /**
   * Save Tier 1 index for a module
   */
  saveTier1Index(moduleId: string, manifest: Tier1Manifest): Promise<void>;
  
  // ============================================================================
  // Tier 2 Index (File Indexes)
  // ============================================================================
  
  /**
   * Load file index (Tier 2)
   */
  loadFileIndex(moduleId: string, filepath: string): Promise<FileIndex | null>;
  
  /**
   * Save file index (Tier 2)
   */
  saveFileIndex(moduleId: string, filepath: string, index: FileIndex): Promise<void>;
  
  /**
   * Delete file index
   */
  deleteFileIndex(moduleId: string, filepath: string): Promise<void>;
  
  /**
   * List all indexed files for a module
   */
  listIndexedFiles(moduleId: string): Promise<string[]>;
  
  // ============================================================================
  // Utilities
  // ============================================================================
  
  /**
   * Check if index exists for this project
   */
  indexExists(): Promise<boolean>;
  
  /**
   * Delete entire index
   */
  deleteIndex(): Promise<void>;
  
  /**
   * Get the root directory being indexed
   */
  getRootDir(): string;
}

