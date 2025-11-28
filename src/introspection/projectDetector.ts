/**
 * Project Structure Detection
 *
 * Auto-detects monorepo structure and project types from:
 * - Folder layout (apps/, packages/, etc.)
 * - package.json files (for TypeScript/JavaScript projects)
 */

import * as path from "path";
import * as fs from "fs/promises";
import type { Project, ProjectType, ProjectStructure, Scope } from "./types";

/** Maximum depth to scan for package.json files */
const MAX_SCAN_DEPTH = 4;

/** Directories to skip when scanning for package.json */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".raggrep",
]);

/**
 * Patterns for detecting project directories.
 */
const PROJECT_PATTERNS: Array<{
  pattern: RegExp;
  type: ProjectType;
  defaultScope: Scope;
}> = [
  // apps/ - typically frontend or backend apps
  { pattern: /^apps\/([^/]+)/, type: "app", defaultScope: "unknown" },
  // packages/ - shared libraries
  { pattern: /^packages\/([^/]+)/, type: "library", defaultScope: "shared" },
  // libs/ - shared libraries
  { pattern: /^libs\/([^/]+)/, type: "library", defaultScope: "shared" },
  // services/ - backend services
  { pattern: /^services\/([^/]+)/, type: "service", defaultScope: "backend" },
  // scripts/ - tooling
  { pattern: /^scripts\/([^/]+)/, type: "script", defaultScope: "tooling" },
  // tools/ - tooling
  { pattern: /^tools\/([^/]+)/, type: "script", defaultScope: "tooling" },
];

/**
 * Keywords for detecting scope from project name or path.
 */
const SCOPE_KEYWORDS: Record<Scope, string[]> = {
  frontend: [
    "web",
    "webapp",
    "frontend",
    "client",
    "ui",
    "app",
    "mobile",
    "react",
    "vue",
    "angular",
    "next",
    "nuxt",
  ],
  backend: [
    "api",
    "server",
    "backend",
    "service",
    "worker",
    "lambda",
    "functions",
  ],
  shared: ["shared", "common", "utils", "lib", "core", "types", "models"],
  tooling: [
    "scripts",
    "tools",
    "cli",
    "devtools",
    "build",
    "config",
    "infra",
  ],
  unknown: [],
};

/**
 * Detect scope from project name.
 */
export function detectScopeFromName(name: string): Scope {
  const nameLower = name.toLowerCase();

  for (const [scope, keywords] of Object.entries(SCOPE_KEYWORDS)) {
    if (scope === "unknown") continue;
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        return scope as Scope;
      }
    }
  }

  return "unknown";
}

/**
 * Parsed information from a package.json file.
 */
interface PackageJsonInfo {
  name: string;
  relativePath: string;
  type: ProjectType;
  hasWorkspaces: boolean;
}

/**
 * Scan for package.json files and extract project info.
 */
async function scanForPackageJsons(
  rootDir: string,
  currentDir: string = "",
  depth: number = 0
): Promise<PackageJsonInfo[]> {
  if (depth > MAX_SCAN_DEPTH) return [];

  const results: PackageJsonInfo[] = [];
  const fullDir = currentDir ? path.join(rootDir, currentDir) : rootDir;

  try {
    const entries = await fs.readdir(fullDir, { withFileTypes: true });

    // Check for package.json in current directory
    const hasPackageJson = entries.some(
      (e) => e.isFile() && e.name === "package.json"
    );

    if (hasPackageJson && currentDir) {
      // Don't add root package.json as a project
      const info = await parsePackageJson(rootDir, currentDir);
      if (info) {
        results.push(info);
      }
    }

    // Recursively scan subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const subPath = currentDir ? `${currentDir}/${entry.name}` : entry.name;
      const subResults = await scanForPackageJsons(rootDir, subPath, depth + 1);
      results.push(...subResults);
    }
  } catch {
    // Directory not readable
  }

  return results;
}

/**
 * Parse a package.json file and extract project metadata.
 */
async function parsePackageJson(
  rootDir: string,
  relativePath: string
): Promise<PackageJsonInfo | null> {
  try {
    const packageJsonPath = path.join(rootDir, relativePath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    // Use package name or folder name
    const name = pkg.name || path.basename(relativePath);

    // Detect type from dependencies
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    let type: ProjectType = "unknown";

    if (deps["next"] || deps["react"] || deps["vue"] || deps["svelte"]) {
      type = "app";
    } else if (deps["express"] || deps["fastify"] || deps["koa"] || deps["hono"]) {
      type = "service";
    } else if (pkg.main || pkg.exports) {
      type = "library";
    }

    // Check if this is a monorepo root (has workspaces)
    const hasWorkspaces = Boolean(pkg.workspaces);

    return { name, relativePath, type, hasWorkspaces };
  } catch {
    return null;
  }
}

/**
 * Detect project structure in a workspace.
 *
 * Uses two strategies:
 * 1. Folder pattern detection (apps/, packages/, etc.)
 * 2. package.json scanning for more accurate project boundaries
 */
export async function detectProjectStructure(
  rootDir: string
): Promise<ProjectStructure> {
  const projectMap = new Map<string, Project>();
  let isMonorepo = false;

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    // Strategy 1: Check for standard monorepo patterns
    const monorepoPatterns = ["apps", "packages", "libs", "services"];
    const hasMonorepoStructure = monorepoPatterns.some((p) =>
      dirNames.includes(p)
    );

    if (hasMonorepoStructure) {
      isMonorepo = true;

      // Scan each monorepo directory for subprojects
      for (const pattern of monorepoPatterns) {
        if (!dirNames.includes(pattern)) continue;

        const patternDir = path.join(rootDir, pattern);
        try {
          const subDirs = await fs.readdir(patternDir, { withFileTypes: true });

          for (const subDir of subDirs) {
            if (!subDir.isDirectory()) continue;

            const projectRoot = `${pattern}/${subDir.name}`;
            const type = getProjectType(pattern);

            // Add to map (can be overridden by package.json info)
            projectMap.set(projectRoot, {
              name: subDir.name,
              root: projectRoot,
              type,
            });
          }
        } catch {
          // Directory doesn't exist or not readable
        }
      }
    }

    // Strategy 2: Scan for package.json files
    const packageJsons = await scanForPackageJsons(rootDir);

    for (const pkg of packageJsons) {
      // Monorepo indicator: nested package.json with workspaces
      if (pkg.hasWorkspaces) {
        isMonorepo = true;
      }

      // Multiple package.json files indicate monorepo
      if (packageJsons.length > 1) {
        isMonorepo = true;
      }

      // Override or add project from package.json
      // package.json info is more authoritative than folder pattern
      projectMap.set(pkg.relativePath, {
        name: pkg.name,
        root: pkg.relativePath,
        type: pkg.type,
      });
    }

    // Check root package.json for workspaces and type
    let rootType: ProjectType = "unknown";
    try {
      const rootPkgPath = path.join(rootDir, "package.json");
      const rootPkg = JSON.parse(await fs.readFile(rootPkgPath, "utf-8"));

      if (rootPkg.workspaces) {
        isMonorepo = true;
      }

      // Detect type from dependencies
      const deps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
      if (deps["next"] || deps["react"] || deps["vue"]) {
        rootType = "app";
      } else if (deps["express"] || deps["fastify"] || deps["koa"]) {
        rootType = "service";
      }
    } catch {
      // No package.json or not readable
    }

    // Convert map to sorted array (shorter paths first for better matching)
    const projects = Array.from(projectMap.values()).sort(
      (a, b) => a.root.length - b.root.length
    );

    return {
      projects,
      isMonorepo,
      rootType: isMonorepo ? undefined : rootType,
    };
  } catch {
    return {
      projects: [],
      isMonorepo: false,
      rootType: "unknown",
    };
  }
}

/**
 * Get project type from pattern directory name.
 */
function getProjectType(patternDir: string): ProjectType {
  switch (patternDir) {
    case "apps":
      return "app";
    case "packages":
    case "libs":
      return "library";
    case "services":
      return "service";
    case "scripts":
    case "tools":
      return "script";
    default:
      return "unknown";
  }
}

/**
 * Find which project a file belongs to.
 *
 * Matches against detected projects (from package.json and folder patterns).
 * For nested projects, returns the most specific (deepest) match.
 */
export function findProjectForFile(
  filepath: string,
  structure: ProjectStructure
): Project {
  // Normalize path
  const normalizedPath = filepath.replace(/\\/g, "/");

  // Find all matching projects
  const matches: Project[] = [];

  // Check against detected projects (from package.json scanning)
  for (const project of structure.projects) {
    if (
      normalizedPath === project.root ||
      normalizedPath.startsWith(project.root + "/")
    ) {
      matches.push(project);
    }
  }

  // If we have matches, return the most specific (longest root path)
  if (matches.length > 0) {
    return matches.reduce((best, current) =>
      current.root.length > best.root.length ? current : best
    );
  }

  // Fallback: Check against pattern matching for any path
  for (const { pattern, type } of PROJECT_PATTERNS) {
    const match = normalizedPath.match(pattern);
    if (match) {
      return {
        name: match[1],
        root: match[0],
        type,
      };
    }
  }

  // Default: root project
  return {
    name: "root",
    root: "",
    type: structure.rootType ?? "unknown",
  };
}

