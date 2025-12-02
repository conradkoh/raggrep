/**
 * Project Structure Detection
 *
 * Auto-detects monorepo structure and project types from:
 * - Folder layout (apps/, packages/, etc.)
 * - package.json files (for TypeScript/JavaScript projects)
 *
 * This module performs file I/O to scan the filesystem.
 */

import * as path from "path";
import * as fs from "fs/promises";
import type {
  Project,
  ProjectType,
  ProjectStructure,
} from "../../domain/entities/introspection";

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
      const info = await parsePackageJson(rootDir, currentDir);
      if (info) results.push(info);
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

    const name = pkg.name || path.basename(relativePath);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    let type: ProjectType = "unknown";

    if (deps["next"] || deps["react"] || deps["vue"] || deps["svelte"]) {
      type = "app";
    } else if (
      deps["express"] ||
      deps["fastify"] ||
      deps["koa"] ||
      deps["hono"]
    ) {
      type = "service";
    } else if (pkg.main || pkg.exports) {
      type = "library";
    }

    const hasWorkspaces = Boolean(pkg.workspaces);
    return { name, relativePath, type, hasWorkspaces };
  } catch {
    return null;
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

      for (const pattern of monorepoPatterns) {
        if (!dirNames.includes(pattern)) continue;

        const patternDir = path.join(rootDir, pattern);
        try {
          const subDirs = await fs.readdir(patternDir, { withFileTypes: true });

          for (const subDir of subDirs) {
            if (!subDir.isDirectory()) continue;

            const projectRoot = `${pattern}/${subDir.name}`;
            const type = getProjectType(pattern);

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
      if (pkg.hasWorkspaces) isMonorepo = true;
      if (packageJsons.length > 1) isMonorepo = true;

      projectMap.set(pkg.relativePath, {
        name: pkg.name,
        root: pkg.relativePath,
        type: pkg.type,
      });
    }

    // Check root package.json
    let rootType: ProjectType = "unknown";
    try {
      const rootPkgPath = path.join(rootDir, "package.json");
      const rootPkg = JSON.parse(await fs.readFile(rootPkgPath, "utf-8"));

      if (rootPkg.workspaces) isMonorepo = true;

      const deps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
      if (deps["next"] || deps["react"] || deps["vue"]) {
        rootType = "app";
      } else if (deps["express"] || deps["fastify"] || deps["koa"]) {
        rootType = "service";
      }
    } catch {
      // No package.json
    }

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



