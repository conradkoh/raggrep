/**
 * Node.js FileSystem Adapter
 * 
 * Implements the FileSystem port using Node.js fs/promises and path modules.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { FileSystem, FileStats } from '../../domain/ports';

/**
 * Node.js implementation of the FileSystem port.
 */
export class NodeFileSystem implements FileSystem {
  async readFile(filepath: string): Promise<string> {
    return fs.readFile(filepath, 'utf-8');
  }
  
  async writeFile(filepath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, content, 'utf-8');
  }
  
  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  
  async getStats(filepath: string): Promise<FileStats> {
    const stats = await fs.stat(filepath);
    return {
      lastModified: stats.mtime.toISOString(),
      size: stats.isDirectory() ? undefined : stats.size,
      isDirectory: stats.isDirectory(),
    };
  }
  
  async exists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }
  
  async mkdir(dirpath: string): Promise<void> {
    await fs.mkdir(dirpath, { recursive: true });
  }
  
  async readDir(dirpath: string): Promise<string[]> {
    return fs.readdir(dirpath);
  }
  
  async findFiles(rootDir: string, patterns: string[], ignore: string[]): Promise<string[]> {
    const ignorePatterns = ignore.map(p => `**/${p}/**`);
    
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: rootDir,
        absolute: true,
        ignore: ignorePatterns,
      });
      files.push(...matches);
    }
    
    // Remove duplicates
    return [...new Set(files)];
  }
  
  join(...segments: string[]): string {
    return path.join(...segments);
  }
  
  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
  
  resolve(...segments: string[]): string {
    return path.resolve(...segments);
  }
  
  dirname(filepath: string): string {
    return path.dirname(filepath);
  }
  
  extname(filepath: string): string {
    return path.extname(filepath);
  }
}

/**
 * Default singleton instance
 */
export const nodeFileSystem = new NodeFileSystem();

