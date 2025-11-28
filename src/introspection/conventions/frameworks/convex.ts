/**
 * Convex Framework Conventions
 *
 * Patterns for recognizing Convex backend files and structures.
 * Convex is a backend platform with real-time sync.
 */

import type { FileConvention, FrameworkConventions } from "../types";

const convexConventions: FileConvention[] = [
  // ============================================================================
  // Configuration
  // ============================================================================
  {
    id: "convex-config",
    name: "Convex Config",
    description: "Convex project configuration",
    category: "configuration",
    match: (filepath, filename) => filename === "convex.json",
    keywords: ["convex", "config", "backend", "settings"],
  },

  // ============================================================================
  // Schema
  // ============================================================================
  {
    id: "convex-schema",
    name: "Convex Schema",
    description: "Convex database schema definition",
    category: "framework",
    match: (filepath, filename) =>
      filename === "schema.ts" &&
      (filepath.includes("/convex/") || filepath.startsWith("convex/")),
    keywords: ["convex", "schema", "database", "tables", "types", "model"],
  },

  // ============================================================================
  // Functions
  // ============================================================================
  {
    id: "convex-function",
    name: "Convex Function File",
    description: "Convex backend function file",
    category: "framework",
    match: (filepath, filename, extension) =>
      (extension === ".ts" || extension === ".js") &&
      (filepath.includes("/convex/") || filepath.startsWith("convex/")) &&
      !filepath.includes("/_generated/") &&
      filename !== "schema.ts" &&
      !filename.startsWith("_"),
    keywords: ["convex", "function", "backend", "query", "mutation", "action"],
    dynamicKeywords: (filepath) => {
      // Extract function file name as keyword
      const match = filepath.match(/convex\/(.+?)\.(ts|js)/);
      if (match) {
        const name = match[1].replace(/\//g, " ").split(" ").pop() || "";
        if (name && !["schema", "http", "crons"].includes(name)) {
          return [name.toLowerCase()];
        }
      }
      return [];
    },
  },

  // ============================================================================
  // HTTP Routes
  // ============================================================================
  {
    id: "convex-http",
    name: "Convex HTTP Routes",
    description: "Convex HTTP endpoint definitions",
    category: "framework",
    match: (filepath, filename) =>
      filename === "http.ts" &&
      (filepath.includes("/convex/") || filepath.startsWith("convex/")),
    keywords: ["convex", "http", "routes", "api", "endpoints", "rest"],
  },

  // ============================================================================
  // Cron Jobs
  // ============================================================================
  {
    id: "convex-crons",
    name: "Convex Cron Jobs",
    description: "Convex scheduled function definitions",
    category: "framework",
    match: (filepath, filename) =>
      filename === "crons.ts" &&
      (filepath.includes("/convex/") || filepath.startsWith("convex/")),
    keywords: ["convex", "crons", "scheduled", "jobs", "background", "recurring"],
  },

  // ============================================================================
  // Generated Files
  // ============================================================================
  {
    id: "convex-generated",
    name: "Convex Generated",
    description: "Convex auto-generated files",
    category: "framework",
    match: (filepath) =>
      filepath.includes("/convex/_generated/") || filepath.startsWith("convex/_generated/"),
    keywords: ["convex", "generated", "types", "api"],
  },

  // ============================================================================
  // Auth
  // ============================================================================
  {
    id: "convex-auth",
    name: "Convex Auth",
    description: "Convex authentication configuration",
    category: "framework",
    match: (filepath, filename) =>
      filename === "auth.ts" &&
      (filepath.includes("/convex/") || filepath.startsWith("convex/")),
    keywords: ["convex", "auth", "authentication", "login", "users"],
  },
  {
    id: "convex-auth-config",
    name: "Convex Auth Config",
    description: "Convex auth configuration file",
    category: "configuration",
    match: (filepath, filename) => filename === "auth.config.ts",
    keywords: ["convex", "auth", "config", "providers", "oauth"],
  },
];

/**
 * Convex framework conventions provider.
 */
export const convexFramework: FrameworkConventions = {
  id: "convex",
  name: "Convex",
  detect: (filepath) => {
    // Detect if this is likely a Convex project
    return (
      filepath === "convex.json" ||
      filepath.startsWith("convex/") ||
      filepath.includes("/convex/")
    );
  },
  conventions: convexConventions,
};
