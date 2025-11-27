/**
 * File-based Index Storage Adapter
 * 
 * Implements the IndexStorage port using the filesystem.
 * Index data is stored as JSON files in the .raggrep directory.
 */

import type { IndexStorage } from '../../domain/ports';
import type { FileSystem } from '../../domain/ports';
import type { 
  Config, 
  FileIndex, 
  ModuleManifest, 
  GlobalManifest,
  FileSummary,
  SymbolicIndexMeta,
  Tier1Manifest 
} from '../../domain/entities';
import { createDefaultConfig } from '../../domain/entities';

/**
 * Filesystem-based index storage.
 * 
 * Structure:
 * .raggrep/
 * ├── config.json
 * ├── manifest.json (global)
 * └── index/
 *     └── <moduleId>/
 *         ├── manifest.json (module)
 *         ├── symbolic/
 *         │   ├── _meta.json (BM25 statistics)
 *         │   └── <filepath>.json (per-file summaries)
 *         └── <filepath>.json (file indexes with embeddings)
 */
export class FileIndexStorage implements IndexStorage {
  private fs: FileSystem;
  private rootDir: string;
  private indexDir: string;

  constructor(fs: FileSystem, rootDir: string, indexDir: string = '.raggrep') {
    this.fs = fs;
    this.rootDir = fs.resolve(rootDir);
    this.indexDir = indexDir;
  }

  // ============================================================================
  // Path Helpers
  // ============================================================================

  private getIndexPath(): string {
    return this.fs.join(this.rootDir, this.indexDir);
  }

  private getConfigPath(): string {
    return this.fs.join(this.getIndexPath(), 'config.json');
  }

  private getGlobalManifestPath(): string {
    return this.fs.join(this.getIndexPath(), 'manifest.json');
  }

  private getModuleIndexPath(moduleId: string): string {
    return this.fs.join(this.getIndexPath(), 'index', moduleId);
  }

  private getModuleManifestPath(moduleId: string): string {
    return this.fs.join(this.getModuleIndexPath(moduleId), 'manifest.json');
  }

  // Symbolic index paths
  private getSymbolicPath(moduleId: string): string {
    return this.fs.join(this.getModuleIndexPath(moduleId), 'symbolic');
  }

  private getSymbolicMetaPath(moduleId: string): string {
    return this.fs.join(this.getSymbolicPath(moduleId), '_meta.json');
  }

  private getSymbolicFilePath(moduleId: string, filepath: string): string {
    const jsonPath = filepath.replace(/\.[^.]+$/, '.json');
    return this.fs.join(this.getSymbolicPath(moduleId), jsonPath);
  }

  // File index paths (embeddings)
  private getFileIndexPath(moduleId: string, filepath: string): string {
    const jsonPath = filepath.replace(/\.[^.]+$/, '.json');
    return this.fs.join(this.getModuleIndexPath(moduleId), jsonPath);
  }

  /** @deprecated Use getSymbolicMetaPath instead */
  private getTier1Path(moduleId: string): string {
    return this.fs.join(this.getModuleIndexPath(moduleId), 'tier1.json');
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  async loadConfig(): Promise<Config> {
    try {
      const content = await this.fs.readFile(this.getConfigPath());
      const savedConfig = JSON.parse(content) as Partial<Config>;
      return { ...createDefaultConfig(), ...savedConfig };
    } catch {
      return createDefaultConfig();
    }
  }

  async saveConfig(config: Config): Promise<void> {
    await this.fs.writeFile(this.getConfigPath(), JSON.stringify(config, null, 2));
  }

  // ============================================================================
  // Global Manifest
  // ============================================================================

  async loadGlobalManifest(): Promise<GlobalManifest | null> {
    try {
      const content = await this.fs.readFile(this.getGlobalManifestPath());
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async saveGlobalManifest(manifest: GlobalManifest): Promise<void> {
    await this.fs.writeFile(this.getGlobalManifestPath(), JSON.stringify(manifest, null, 2));
  }

  // ============================================================================
  // Module Manifest
  // ============================================================================

  async loadModuleManifest(moduleId: string): Promise<ModuleManifest | null> {
    try {
      const content = await this.fs.readFile(this.getModuleManifestPath(moduleId));
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async saveModuleManifest(moduleId: string, manifest: ModuleManifest): Promise<void> {
    await this.fs.writeFile(this.getModuleManifestPath(moduleId), JSON.stringify(manifest, null, 2));
  }

  // ============================================================================
  // Symbolic Index (lightweight file summaries for keyword search)
  // ============================================================================

  async loadSymbolicMeta(moduleId: string): Promise<SymbolicIndexMeta | null> {
    try {
      const content = await this.fs.readFile(this.getSymbolicMetaPath(moduleId));
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async saveSymbolicMeta(moduleId: string, meta: SymbolicIndexMeta): Promise<void> {
    await this.fs.writeFile(this.getSymbolicMetaPath(moduleId), JSON.stringify(meta, null, 2));
  }

  async loadFileSummary(moduleId: string, filepath: string): Promise<FileSummary | null> {
    try {
      const content = await this.fs.readFile(this.getSymbolicFilePath(moduleId, filepath));
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async saveFileSummary(moduleId: string, filepath: string, summary: FileSummary): Promise<void> {
    await this.fs.writeFile(this.getSymbolicFilePath(moduleId, filepath), JSON.stringify(summary, null, 2));
  }

  async deleteFileSummary(moduleId: string, filepath: string): Promise<void> {
    try {
      await this.fs.deleteFile(this.getSymbolicFilePath(moduleId, filepath));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * List all file summaries by reading the module manifest.
   * Returns filepaths relative to the project root.
   */
  async listFileSummaries(moduleId: string): Promise<string[]> {
    const manifest = await this.loadModuleManifest(moduleId);
    if (!manifest) {
      return [];
    }
    return Object.keys(manifest.files);
  }

  // ============================================================================
  // Tier 1 Index (deprecated - use Symbolic Index instead)
  // ============================================================================

  /** @deprecated Use loadSymbolicMeta and loadFileSummary instead */
  async loadTier1Index(moduleId: string): Promise<Tier1Manifest | null> {
    try {
      const content = await this.fs.readFile(this.getTier1Path(moduleId));
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /** @deprecated Use saveSymbolicMeta and saveFileSummary instead */
  async saveTier1Index(moduleId: string, manifest: Tier1Manifest): Promise<void> {
    await this.fs.writeFile(this.getTier1Path(moduleId), JSON.stringify(manifest, null, 2));
  }

  // ============================================================================
  // File Indexes (full index with embeddings)
  // ============================================================================

  async loadFileIndex(moduleId: string, filepath: string): Promise<FileIndex | null> {
    try {
      const content = await this.fs.readFile(this.getFileIndexPath(moduleId, filepath));
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async saveFileIndex(moduleId: string, filepath: string, index: FileIndex): Promise<void> {
    await this.fs.writeFile(this.getFileIndexPath(moduleId, filepath), JSON.stringify(index, null, 2));
  }

  async deleteFileIndex(moduleId: string, filepath: string): Promise<void> {
    await this.fs.deleteFile(this.getFileIndexPath(moduleId, filepath));
  }

  async listIndexedFiles(moduleId: string): Promise<string[]> {
    const manifest = await this.loadModuleManifest(moduleId);
    if (!manifest) {
      return [];
    }
    return Object.keys(manifest.files);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  async indexExists(): Promise<boolean> {
    return this.fs.exists(this.getIndexPath());
  }

  async deleteIndex(): Promise<void> {
    // Note: This is a simplified implementation
    // A full implementation would recursively delete the directory
    const indexPath = this.getIndexPath();
    if (await this.fs.exists(indexPath)) {
      // For safety, we don't implement recursive delete here
      throw new Error('deleteIndex not fully implemented - please delete .raggrep manually');
    }
  }

  getRootDir(): string {
    return this.rootDir;
  }
}

