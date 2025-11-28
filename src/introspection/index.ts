/**
 * Introspection Module
 *
 * Manages file metadata for context-aware search boosting.
 */

import * as path from "path";
import * as fs from "fs/promises";
import type {
  FileIntrospection,
  ProjectStructure,
  IntrospectionConfig,
} from "./types";
import { detectProjectStructure } from "./projectDetector";
import { introspectFile, introspectionToKeywords } from "./fileIntrospector";
import { getRaggrepDir } from "../utils/config";
import type { Config } from "../domain/entities";

// Re-export types
export type { FileIntrospection, ProjectStructure, Project, Scope, ProjectType } from "./types";
export { introspectFile, introspectionToKeywords } from "./fileIntrospector";
export { detectProjectStructure, detectScopeFromName } from "./projectDetector";

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

    // Find matching project override
    for (const [projectPath, overrides] of Object.entries(this.config.projects)) {
      if (intro.filepath.startsWith(projectPath + "/") || intro.project.root === projectPath) {
        if (overrides.scope) {
          intro.scope = overrides.scope;
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
    const introDir = path.join(getRaggrepDir(this.rootDir, config), "introspection");
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

    console.log(
      `  [Introspection] Saved metadata for ${this.files.size} files`
    );
  }

  /**
   * Load introspection index from disk.
   */
  async load(config: Config): Promise<void> {
    const introDir = path.join(getRaggrepDir(this.rootDir, config), "introspection");

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
  private async loadFilesRecursive(basePath: string, prefix: string): Promise<void> {
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

/**
 * Calculate search boost based on introspection and query.
 *
 * @param intro - File introspection
 * @param query - Search query
 * @returns Boost multiplier (1.0 = no boost, >1.0 = positive boost)
 */
export function calculateIntrospectionBoost(
  intro: FileIntrospection,
  query: string
): number {
  let boost = 1.0;
  const queryTerms = query.toLowerCase().split(/\s+/);

  // Domain match: +10%
  if (intro.domain && queryTerms.some((t) => intro.domain!.includes(t) || t.includes(intro.domain!))) {
    boost *= 1.1;
  }

  // Layer match: +5%
  if (intro.layer && queryTerms.some((t) => intro.layer!.includes(t) || t.includes(intro.layer!))) {
    boost *= 1.05;
  }

  // Scope match for backend queries: +5%
  const backendTerms = ["api", "server", "backend", "endpoint", "route"];
  if (
    queryTerms.some((t) => backendTerms.includes(t)) &&
    intro.scope === "backend"
  ) {
    boost *= 1.05;
  }

  // Scope match for frontend queries: +5%
  const frontendTerms = ["ui", "component", "page", "view", "frontend", "client"];
  if (
    queryTerms.some((t) => frontendTerms.includes(t)) &&
    intro.scope === "frontend"
  ) {
    boost *= 1.05;
  }

  // Path segment match: +3% per match
  for (const segment of intro.pathSegments) {
    if (queryTerms.some((t) => segment.toLowerCase().includes(t))) {
      boost *= 1.03;
    }
  }

  // Project name match: +5%
  if (
    intro.project.name !== "root" &&
    queryTerms.some((t) => intro.project.name.toLowerCase().includes(t))
  ) {
    boost *= 1.05;
  }

  return boost;
}

