/**
 * Project Structure Detection
 *
 * Auto-detects monorepo structure and project types from folder layout.
 */

import * as path from "path";
import * as fs from "fs/promises";
import type { Project, ProjectType, ProjectStructure, Scope } from "./types";

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
 * Detect project structure in a workspace.
 */
export async function detectProjectStructure(
  rootDir: string
): Promise<ProjectStructure> {
  const projects: Project[] = [];
  let isMonorepo = false;

  try {
    // Check for monorepo indicators
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    // Check if any monorepo patterns match
    const monorepoPatterns = ["apps", "packages", "libs", "services"];
    const hasMonorepoStructure = monorepoPatterns.some((p) =>
      dirNames.includes(p)
    );

    if (hasMonorepoStructure) {
      isMonorepo = true;

      // Scan each monorepo directory
      for (const pattern of monorepoPatterns) {
        if (!dirNames.includes(pattern)) continue;

        const patternDir = path.join(rootDir, pattern);
        try {
          const subDirs = await fs.readdir(patternDir, { withFileTypes: true });

          for (const subDir of subDirs) {
            if (!subDir.isDirectory()) continue;

            const projectRoot = `${pattern}/${subDir.name}`;
            const type = getProjectType(pattern);
            const scope = detectScopeFromName(subDir.name);

            projects.push({
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

    // Detect root project type from package.json
    let rootType: ProjectType = "unknown";
    try {
      const packageJsonPath = path.join(rootDir, "package.json");
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8")
      );

      // Check for workspaces (monorepo indicator)
      if (packageJson.workspaces) {
        isMonorepo = true;
      }

      // Detect type from dependencies
      if (packageJson.dependencies || packageJson.devDependencies) {
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (deps["next"] || deps["react"] || deps["vue"]) {
          rootType = "app";
        } else if (deps["express"] || deps["fastify"] || deps["koa"]) {
          rootType = "service";
        }
      }
    } catch {
      // No package.json or not readable
    }

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
 */
export function findProjectForFile(
  filepath: string,
  structure: ProjectStructure
): Project {
  // Normalize path
  const normalizedPath = filepath.replace(/\\/g, "/");

  // Check against detected projects
  for (const project of structure.projects) {
    if (normalizedPath.startsWith(project.root + "/")) {
      return project;
    }
  }

  // Check against pattern matching for any path
  for (const { pattern, type, defaultScope } of PROJECT_PATTERNS) {
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

