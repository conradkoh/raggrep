/**
 * Introspection Index Storage
 *
 * Manages file metadata for context-aware search boosting.
 * Handles saving and loading introspection data to/from disk.
 */

import * as path from "path";
import * as fs from "fs/promises";
import type {
  FileIntrospection,
  ProjectStructure,
  IntrospectionConfig,
  Scope,
  Config,
} from "../../domain/entities";
import { detectProjectStructure } from "./projectDetector";
import { introspectFile } from "../../domain/services/introspection";
import { getRaggrepDir } from "../config";

/**
 * Introspection index for a workspace.
 */
export class IntrospectionIndex {
  private rootDir: string;
  private structure: ProjectStructure | null = null;
  private files: Map<string, FileIntrospection> = new Map();
  private config: IntrospectionConfig = {};

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * Initialize by detecting project structure.
   */
  async initialize(): Promise<void> {
    this.structure = await detectProjectStructure(this.rootDir);

    // Try to load config overrides
    try {
      const configPath = path.join(this.rootDir, ".raggrep", "config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      this.config = config.introspection || {};
    } catch {
      // No config or introspection section
    }
  }

  /**
   * Get project structure.
   */
  getStructure(): ProjectStructure | null {
    return this.structure;
  }

  /**
   * Introspect a file and add to index.
   */
  addFile(filepath: string, content?: string): FileIntrospection {
    if (!this.structure) {
      throw new Error("IntrospectionIndex not initialized");
    }

    const intro = introspectFile(filepath, this.structure, content);

    // Apply config overrides
    this.applyOverrides(intro);

    this.files.set(filepath, intro);
    return intro;
  }

  /**
   * Get introspection for a file.
   */
  getFile(filepath: string): FileIntrospection | undefined {
    return this.files.get(filepath);
  }

  /**
   * Get all introspected files.
   */
  getAllFiles(): FileIntrospection[] {
    return Array.from(this.files.values());
  }

  /**
   * Apply config overrides to introspection.
   */
  private applyOverrides(intro: FileIntrospection): void {
    if (!this.config.projects) return;

    for (const [projectPath, overrides] of Object.entries(
      this.config.projects
    )) {
      if (
        intro.filepath.startsWith(projectPath + "/") ||
        intro.project.root === projectPath
      ) {
        if (overrides.scope) {
          intro.scope = overrides.scope as Scope;
        }
        if (overrides.framework) {
          intro.framework = overrides.framework;
        }
        break;
      }
    }
  }

  /**
   * Save introspection index to disk.
   */
  async save(config: Config): Promise<void> {
    const introDir = path.join(
      getRaggrepDir(this.rootDir, config),
      "introspection"
    );
    await fs.mkdir(introDir, { recursive: true });

    // Save project structure
    const projectPath = path.join(introDir, "_project.json");
    await fs.writeFile(
      projectPath,
      JSON.stringify(
        {
          version: "1.0.0",
          lastUpdated: new Date().toISOString(),
          structure: this.structure,
        },
        null,
        2
      )
    );

    // Save file introspections in directory structure
    for (const [filepath, intro] of this.files) {
      const introFilePath = path.join(
        introDir,
        "files",
        filepath.replace(/\.[^.]+$/, ".json")
      );
      await fs.mkdir(path.dirname(introFilePath), { recursive: true });
      await fs.writeFile(introFilePath, JSON.stringify(intro, null, 2));
    }
  }

  /**
   * Load introspection index from disk.
   */
  async load(config: Config): Promise<void> {
    const introDir = path.join(
      getRaggrepDir(this.rootDir, config),
      "introspection"
    );

    try {
      // Load project structure
      const projectPath = path.join(introDir, "_project.json");
      const projectContent = await fs.readFile(projectPath, "utf-8");
      const projectData = JSON.parse(projectContent);
      this.structure = projectData.structure;

      // Load file introspections
      await this.loadFilesRecursive(path.join(introDir, "files"), "");
    } catch {
      // No introspection index yet
      this.structure = null;
      this.files.clear();
    }
  }

  /**
   * Recursively load file introspections.
   */
  private async loadFilesRecursive(
    basePath: string,
    prefix: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(basePath, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await this.loadFilesRecursive(entryPath, relativePath);
        } else if (entry.name.endsWith(".json")) {
          const content = await fs.readFile(entryPath, "utf-8");
          const intro: FileIntrospection = JSON.parse(content);
          this.files.set(intro.filepath, intro);
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.files.clear();
    this.structure = null;
  }
}
