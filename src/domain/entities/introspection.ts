/**
 * Introspection Types
 *
 * Shared metadata extracted from file paths and project structure.
 * Used by all index modules for context-aware scoring.
 */

/**
 * Project type detected from folder structure.
 */
export type ProjectType = "app" | "library" | "service" | "script" | "unknown";

/**
 * Scope of the file in the overall system.
 */
export type Scope = "frontend" | "backend" | "shared" | "tooling" | "unknown";

/**
 * Detected project within a monorepo.
 */
export interface Project {
  /** Project name (from folder or package.json) */
  name: string;
  /** Root path relative to workspace */
  root: string;
  /** Detected project type */
  type: ProjectType;
}

/**
 * File introspection metadata.
 * Computed once during indexing, used for search boosting.
 */
export interface FileIntrospection {
  /** File path relative to workspace */
  filepath: string;

  /** Project context (from folder structure or package.json) */
  project: Project;

  /** Scope detection (frontend, backend, shared, tooling) */
  scope: Scope;

  /** Architectural layer (controller, service, repository, etc.) */
  layer?: string;

  /** Feature domain (auth, users, payments, etc.) */
  domain?: string;

  /** Detected programming language */
  language: string;

  /** Detected framework (nextjs, express, fastify, etc.) */
  framework?: string;

  /** Path depth from workspace root */
  depth: number;

  /** Path segments for keyword matching */
  pathSegments: string[];
}

/**
 * Project structure metadata.
 */
export interface ProjectStructure {
  /** Detected projects in the workspace */
  projects: Project[];

  /** Is this a monorepo? */
  isMonorepo: boolean;

  /** Root project type (if single project) */
  rootType?: ProjectType;
}

/**
 * Introspection configuration overrides.
 */
export interface IntrospectionConfig {
  /** Manual project scope overrides */
  projects?: Record<string, { scope?: Scope; framework?: string }>;
}







