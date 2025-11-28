/**
 * File Introspection
 *
 * Extracts metadata from individual files for context-aware search.
 */

import * as path from "path";
import type {
  FileIntrospection,
  Project,
  ProjectStructure,
  Scope,
} from "./types";
import { findProjectForFile, detectScopeFromName } from "./projectDetector";

/**
 * Layer detection patterns.
 */
const LAYER_PATTERNS: Record<string, string[]> = {
  controller: ["controller", "api", "routes", "route", "handler"],
  service: ["service", "logic", "usecase", "usecases", "handler"],
  repository: ["repository", "repo", "dao", "store", "persistence"],
  model: ["model", "models", "entity", "entities", "schema", "schemas", "types", "type"],
  util: ["util", "utils", "helper", "helpers", "common", "lib"],
  config: ["config", "configuration", "settings"],
  middleware: ["middleware", "middlewares"],
  domain: ["domain"],
  infrastructure: ["infrastructure", "infra"],
  application: ["application", "app"],
  presentation: ["presentation", "ui", "views", "view", "component", "components"],
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
 * Framework detection from imports (simplified).
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
};

/**
 * Extract introspection metadata for a file.
 */
export function introspectFile(
  filepath: string,
  structure: ProjectStructure,
  fileContent?: string
): FileIntrospection {
  // Normalize path
  const normalizedPath = filepath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter((s) => s.length > 0);
  const filename = segments[segments.length - 1] || "";
  const ext = path.extname(filename);

  // Find project
  const project = findProjectForFile(normalizedPath, structure);

  // Detect language
  const language = EXTENSION_TO_LANGUAGE[ext] || "unknown";

  // Detect layer from path
  const layer = detectLayer(segments, filename);

  // Detect domain from path
  const domain = detectDomain(segments);

  // Detect scope
  const scope = detectScope(segments, project, layer);

  // Detect framework (if content provided)
  let framework: string | undefined;
  if (fileContent) {
    framework = detectFramework(fileContent);
  }

  return {
    filepath: normalizedPath,
    project,
    scope,
    layer,
    domain,
    language,
    framework,
    depth: segments.length - 1, // Exclude filename
    pathSegments: segments.slice(0, -1), // Exclude filename
  };
}

/**
 * Detect architectural layer from path segments.
 */
function detectLayer(segments: string[], filename: string): string | undefined {
  // Check filename first (e.g., userController.ts)
  const filenameLower = filename.toLowerCase();
  for (const [layer, patterns] of Object.entries(LAYER_PATTERNS)) {
    for (const pattern of patterns) {
      if (filenameLower.includes(pattern)) {
        return layer;
      }
    }
  }

  // Check directory segments
  for (let i = segments.length - 2; i >= 0; i--) {
    const segment = segments[i].toLowerCase();
    for (const [layer, patterns] of Object.entries(LAYER_PATTERNS)) {
      if (patterns.includes(segment)) {
        return layer;
      }
    }
  }

  return undefined;
}

/**
 * Detect feature domain from path segments.
 */
function detectDomain(segments: string[]): string | undefined {
  // Skip common non-domain segments
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

    // Check if it matches a known domain
    if (DOMAIN_PATTERNS.includes(segmentLower)) {
      return segmentLower;
    }

    // Check for partial matches (e.g., "userService" → "user")
    for (const domain of DOMAIN_PATTERNS) {
      if (segmentLower.startsWith(domain) || segmentLower.endsWith(domain)) {
        return domain;
      }
    }
  }

  return undefined;
}

/**
 * Detect scope from path and project.
 */
function detectScope(
  segments: string[],
  project: Project,
  layer?: string
): Scope {
  // Check project-level scope from project name
  const projectScope = detectScopeFromName(project.name);
  if (projectScope !== "unknown") {
    return projectScope;
  }

  // Infer from layer
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

  // Check path segments for scope hints
  for (const segment of segments) {
    const segmentLower = segment.toLowerCase();
    if (["server", "api", "backend"].includes(segmentLower)) {
      return "backend";
    }
    if (["client", "web", "frontend", "ui"].includes(segmentLower)) {
      return "frontend";
    }
    if (["shared", "common", "lib", "libs"].includes(segmentLower)) {
      return "shared";
    }
  }

  return "unknown";
}

/**
 * Detect framework from file content (imports).
 */
function detectFramework(content: string): string | undefined {
  for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    for (const indicator of indicators) {
      if (content.includes(`from '${indicator}`) || content.includes(`from "${indicator}`) ||
          content.includes(`require('${indicator}`) || content.includes(`require("${indicator}`)) {
        return framework;
      }
    }
  }
  return undefined;
}

/**
 * Extract keywords from introspection for search boosting.
 */
export function introspectionToKeywords(intro: FileIntrospection): string[] {
  const keywords: string[] = [];

  // Add project name keywords
  if (intro.project.name && intro.project.name !== "root") {
    keywords.push(intro.project.name.toLowerCase());
  }

  // Add scope
  if (intro.scope !== "unknown") {
    keywords.push(intro.scope);
  }

  // Add layer
  if (intro.layer) {
    keywords.push(intro.layer);
  }

  // Add domain
  if (intro.domain) {
    keywords.push(intro.domain);
  }

  // Add language
  if (intro.language !== "unknown") {
    keywords.push(intro.language);
  }

  // Add framework
  if (intro.framework) {
    keywords.push(intro.framework);
  }

  // Add path segments (filtered)
  const skipSegments = new Set(["src", "lib", "index"]);
  for (const segment of intro.pathSegments) {
    if (!skipSegments.has(segment.toLowerCase()) && segment.length > 2) {
      keywords.push(segment.toLowerCase());
    }
  }

  return [...new Set(keywords)];
}

