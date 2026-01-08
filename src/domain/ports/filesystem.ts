/**
 * FileSystem Port
 * 
 * Abstract interface for filesystem operations.
 * This allows the domain to remain independent of the actual filesystem implementation.
 */

/**
 * File statistics
 */
export interface FileStats {
  /** ISO timestamp of last modification */
  lastModified: string;
  /** File size in bytes (undefined for directories) */
  size?: number;
  /** Whether this is a directory */
  isDirectory?: boolean;
}

/**
 * Abstract filesystem interface.
 * 
 * All filesystem operations should go through this interface
 * to maintain domain independence from Node.js fs module.
 */
export interface FileSystem {
  /**
   * Read a file's content as UTF-8 string
   */
  readFile(filepath: string): Promise<string>;
  
  /**
   * Write content to a file (creates directories if needed)
   */
  writeFile(filepath: string, content: string): Promise<void>;
  
  /**
   * Delete a file
   */
  deleteFile(filepath: string): Promise<void>;
  
  /**
   * Get file statistics
   */
  getStats(filepath: string): Promise<FileStats>;
  
  /**
   * Check if a file exists
   */
  exists(filepath: string): Promise<boolean>;
  
  /**
   * Create directory (and parent directories)
   */
  mkdir(dirpath: string): Promise<void>;
  
  /**
   * List files in a directory
   */
  readDir(dirpath: string): Promise<string[]>;
  
  /**
   * Find files matching patterns
   * @param rootDir - Root directory to search from
   * @param patterns - Glob patterns to match (e.g., ['**\/*.ts'])
   * @param ignore - Patterns to ignore
   */
  findFiles(rootDir: string, patterns: string[], ignore: string[]): Promise<string[]>;
  
  /**
   * Join path segments
   */
  join(...segments: string[]): string;
  
  /**
   * Get relative path from one path to another
   */
  relative(from: string, to: string): string;
  
  /**
   * Resolve to absolute path
   */
  resolve(...segments: string[]): string;
  
  /**
   * Get directory name from path
   */
  dirname(filepath: string): string;
  
  /**
   * Get file extension
   */
  extname(filepath: string): string;
}

