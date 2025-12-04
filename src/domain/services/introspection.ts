/**
 * Introspection Service
 *
 * Pure functions for extracting file metadata from paths and content.
 * No I/O operations - all functions operate on provided data.
 */

import * as path from "path";
import type {
  FileIntrospection,
  Project,
  ProjectStructure,
  Scope,
  ProjectType,
} from "../entities/introspection";
import { getConventionKeywords } from "./conventions";

// ============================================================================
// Constants
// ============================================================================

/**
 * Layer detection patterns.
 */
const LAYER_PATTERNS: Record<string, string[]> = {
  controller: ["controller", "api", "routes", "route", "handler"],
  service: ["service", "logic", "usecase", "usecases", "handler"],
  repository: ["repository", "repo", "dao", "store", "persistence"],
  model: [
    "model",
    "models",
    "entity",
    "entities",
    "schema",
    "schemas",
    "types",
    "type",
  ],
  util: ["util", "utils", "helper", "helpers", "common", "lib"],
  config: ["config", "configuration", "settings"],
  middleware: ["middleware", "middlewares"],
  domain: ["domain"],
  infrastructure: ["infrastructure", "infra"],
  application: ["application", "app"],
  presentation: [
    "presentation",
    "ui",
    "views",
    "view",
    "component",
    "components",
  ],
  test: ["test", "tests", "spec", "specs", "__tests__", "e2e"],
};

/**
 * Domain detection patterns (feature areas).
 */
const DOMAIN_PATTERNS = [
  "auth",
  "authentication",
  "user",
  "users",
  "account",
  "accounts",
  "profile",
  "profiles",
  "product",
  "products",
  "item",
  "items",
  "catalog",
  "order",
  "orders",
  "cart",
  "checkout",
  "payment",
  "payments",
  "billing",
  "subscription",
  "subscriptions",
  "notification",
  "notifications",
  "email",
  "sms",
  "report",
  "reports",
  "analytics",
  "metrics",
  "dashboard",
  "admin",
  "settings",
  "search",
  "chat",
  "message",
  "messages",
  "feed",
  "post",
  "posts",
  "comment",
  "comments",
  "media",
  "upload",
  "file",
  "files",
  "storage",
  "cache",
  "session",
  "log",
  "logs",
  "audit",
];

/**
 * Framework detection from imports.
 */
const FRAMEWORK_INDICATORS: Record<string, string[]> = {
  nextjs: ["next", "next/"],
  express: ["express"],
  fastify: ["fastify"],
  react: ["react"],
  vue: ["vue"],
  angular: ["@angular/"],
  nestjs: ["@nestjs/"],
  koa: ["koa"],
};

/**
 * Language detection from file extension.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".rb": "ruby",
  ".php": "php",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".md": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".txt": "text",
};

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
  tooling: ["scripts", "tools", "cli", "devtools", "build", "config", "infra"],
  unknown: [],
};

/**
 * Patterns for detecting project directories.
 */
const PROJECT_PATTERNS: Array<{
  pattern: RegExp;
  type: ProjectType;
  defaultScope: Scope;
}> = [
  { pattern: /^apps\/([^/]+)/, type: "app", defaultScope: "unknown" },
  { pattern: /^packages\/([^/]+)/, type: "library", defaultScope: "shared" },
  { pattern: /^libs\/([^/]+)/, type: "library", defaultScope: "shared" },
  { pattern: /^services\/([^/]+)/, type: "service", defaultScope: "backend" },
  { pattern: /^scripts\/([^/]+)/, type: "script", defaultScope: "tooling" },
  { pattern: /^tools\/([^/]+)/, type: "script", defaultScope: "tooling" },
];

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Extract introspection metadata for a file.
 *
 * @param filepath - Relative file path
 * @param structure - Project structure (from detectProjectStructure)
 * @param fileContent - Optional file content for framework detection
 */
export function introspectFile(
  filepath: string,
  structure: ProjectStructure,
  fileContent?: string
): FileIntrospection {
  const normalizedPath = filepath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter((s) => s.length > 0);
  const filename = segments[segments.length - 1] || "";
  const ext = path.extname(filename);

  const project = findProjectForFile(normalizedPath, structure);
  const language = EXTENSION_TO_LANGUAGE[ext] || "unknown";
  const layer = detectLayer(segments, filename);
  const domain = detectDomain(segments);
  const scope = detectScope(segments, project, layer);
  const framework = fileContent ? detectFramework(fileContent) : undefined;

  return {
    filepath: normalizedPath,
    project,
    scope,
    layer,
    domain,
    language,
    framework,
    depth: segments.length - 1,
    pathSegments: segments.slice(0, -1),
  };
}

/**
 * Extract keywords from introspection for search boosting.
 */
export function introspectionToKeywords(intro: FileIntrospection): string[] {
  const keywords: string[] = [];

  // Add filename keywords (without extension)
  const filename = path.basename(intro.filepath);
  const filenameWithoutExt = filename.replace(/\.[^.]+$/, "");
  const filenameParts = filenameWithoutExt
    .split(/[-_.]/)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 1);
  keywords.push(...filenameParts);
  keywords.push(filenameWithoutExt.toLowerCase());

  // Add project name keywords
  if (intro.project.name && intro.project.name !== "root") {
    keywords.push(intro.project.name.toLowerCase());
  }

  // Add scope, layer, domain, language, framework
  if (intro.scope !== "unknown") keywords.push(intro.scope);
  if (intro.layer) keywords.push(intro.layer);
  if (intro.domain) keywords.push(intro.domain);
  if (intro.language !== "unknown") keywords.push(intro.language);
  if (intro.framework) keywords.push(intro.framework);

  // Add path segments (filtered)
  const skipSegments = new Set(["src", "lib", "index"]);
  for (const segment of intro.pathSegments) {
    if (!skipSegments.has(segment.toLowerCase()) && segment.length > 2) {
      keywords.push(segment.toLowerCase());
    }
  }

  // Add convention-based keywords
  const conventionKeywords = getConventionKeywords(intro.filepath);
  keywords.push(...conventionKeywords);

  return [...new Set(keywords)];
}

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
 * Find which project a file belongs to.
 */
export function findProjectForFile(
  filepath: string,
  structure: ProjectStructure
): Project {
  const normalizedPath = filepath.replace(/\\/g, "/");
  const matches: Project[] = [];

  // Check against detected projects
  for (const project of structure.projects) {
    if (
      normalizedPath === project.root ||
      normalizedPath.startsWith(project.root + "/")
    ) {
      matches.push(project);
    }
  }

  // Return the most specific match (longest root path)
  if (matches.length > 0) {
    return matches.reduce((best, current) =>
      current.root.length > best.root.length ? current : best
    );
  }

  // Fallback: pattern matching
  for (const { pattern, type } of PROJECT_PATTERNS) {
    const match = normalizedPath.match(pattern);
    if (match) {
      return { name: match[1], root: match[0], type };
    }
  }

  // Default: root project
  return { name: "root", root: "", type: structure.rootType ?? "unknown" };
}

/**
 * Calculate search boost based on introspection and query.
 */
export function calculateIntrospectionBoost(
  intro: FileIntrospection,
  query: string
): number {
  let boost = 1.0;
  const queryTerms = query.toLowerCase().split(/\s+/);

  // Domain match: +10%
  if (
    intro.domain &&
    queryTerms.some(
      (t) => intro.domain!.includes(t) || t.includes(intro.domain!)
    )
  ) {
    boost *= 1.1;
  }

  // Layer match: +5%
  if (
    intro.layer &&
    queryTerms.some((t) => intro.layer!.includes(t) || t.includes(intro.layer!))
  ) {
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
  const frontendTerms = [
    "ui",
    "component",
    "page",
    "view",
    "frontend",
    "client",
  ];
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

// ============================================================================
// Internal Helper Functions
// ============================================================================

function detectLayer(segments: string[], filename: string): string | undefined {
  const filenameLower = filename.toLowerCase();
  for (const [layer, patterns] of Object.entries(LAYER_PATTERNS)) {
    for (const pattern of patterns) {
      if (filenameLower.includes(pattern)) return layer;
    }
  }

  for (let i = segments.length - 2; i >= 0; i--) {
    const segment = segments[i].toLowerCase();
    for (const [layer, patterns] of Object.entries(LAYER_PATTERNS)) {
      if (patterns.includes(segment)) return layer;
    }
  }

  return undefined;
}

function detectDomain(segments: string[]): string | undefined {
  const skipSegments = new Set([
    "src",
    "lib",
    "app",
    "apps",
    "packages",
    "services",
    "modules",
    "features",
    ...Object.values(LAYER_PATTERNS).flat(),
  ]);

  for (const segment of segments) {
    const segmentLower = segment.toLowerCase();
    if (skipSegments.has(segmentLower)) continue;

    if (DOMAIN_PATTERNS.includes(segmentLower)) return segmentLower;

    for (const domain of DOMAIN_PATTERNS) {
      if (segmentLower.startsWith(domain) || segmentLower.endsWith(domain)) {
        return domain;
      }
    }
  }

  return undefined;
}

function detectScope(
  segments: string[],
  project: Project,
  layer?: string
): Scope {
  const projectScope = detectScopeFromName(project.name);
  if (projectScope !== "unknown") return projectScope;

  if (layer) {
    switch (layer) {
      case "controller":
      case "repository":
      case "middleware":
        return "backend";
      case "presentation":
        return "frontend";
      case "util":
      case "model":
        return "shared";
      case "test":
        return "tooling";
    }
  }

  for (const segment of segments) {
    const segmentLower = segment.toLowerCase();
    if (["server", "api", "backend"].includes(segmentLower)) return "backend";
    if (["client", "web", "frontend", "ui"].includes(segmentLower))
      return "frontend";
    if (["shared", "common", "lib", "libs"].includes(segmentLower))
      return "shared";
  }

  return "unknown";
}

function detectFramework(content: string): string | undefined {
  for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    for (const indicator of indicators) {
      if (
        content.includes(`from '${indicator}`) ||
        content.includes(`from "${indicator}`) ||
        content.includes(`require('${indicator}`) ||
        content.includes(`require("${indicator}`)
      ) {
        return framework;
      }
    }
  }
  return undefined;
}




