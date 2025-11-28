/**
 * Entry Point Conventions
 *
 * Patterns for recognizing module entry points and barrel files.
 */

import * as path from "path";
import type { FileConvention } from "./types";

/**
 * Get the parent folder name from a filepath.
 */
function getParentFolder(filepath: string): string {
  const dir = path.dirname(filepath);
  return path.basename(dir);
}

/**
 * Entry point conventions for JavaScript/TypeScript projects.
 */
export const entryPointConventions: FileConvention[] = [
  {
    id: "index-file",
    name: "Index/Barrel File",
    description: "Module entry point that typically re-exports from other files",
    category: "entry-point",
    match: (filepath, filename) => {
      return /^index\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filename);
    },
    keywords: ["entry", "barrel", "exports", "module"],
    // Add parent folder as a strong keyword since "auth/index.ts" should match "auth"
    dynamicKeywords: (filepath) => {
      const parent = getParentFolder(filepath);
      // Don't add generic folder names
      if (["src", "lib", "dist", "build", ".", ""].includes(parent)) {
        return [];
      }
      return [parent.toLowerCase()];
    },
  },

  {
    id: "main-file",
    name: "Main Entry Point",
    description: "Application main entry point",
    category: "entry-point",
    match: (filepath, filename) => {
      return /^main\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filename);
    },
    keywords: ["entry", "main", "entrypoint", "bootstrap", "startup"],
  },

  {
    id: "app-component",
    name: "Root App Component",
    description: "Root application component (React, Vue, etc.)",
    category: "entry-point",
    match: (filepath, filename) => {
      return /^App\.(tsx|jsx|vue|svelte)$/.test(filename);
    },
    keywords: ["root", "app", "application", "component", "main"],
  },

  {
    id: "deno-mod",
    name: "Deno Module Entry",
    description: "Deno module entry point",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "mod.ts";
    },
    keywords: ["entry", "module", "deno", "exports"],
    dynamicKeywords: (filepath) => {
      const parent = getParentFolder(filepath);
      if (["src", "lib", ".", ""].includes(parent)) {
        return [];
      }
      return [parent.toLowerCase()];
    },
  },

  {
    id: "python-init",
    name: "Python Package Init",
    description: "Python package initialization file",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "__init__.py";
    },
    keywords: ["entry", "package", "init", "python", "module"],
    dynamicKeywords: (filepath) => {
      const parent = getParentFolder(filepath);
      if (["src", "lib", ".", ""].includes(parent)) {
        return [];
      }
      return [parent.toLowerCase()];
    },
  },

  {
    id: "rust-lib",
    name: "Rust Library Entry",
    description: "Rust library crate entry point",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "lib.rs" || filename === "main.rs";
    },
    keywords: ["entry", "crate", "rust", "module"],
  },

  // ============================================================================
  // Go Entry Points
  // ============================================================================
  {
    id: "go-main",
    name: "Go Main Entry",
    description: "Go application main entry point",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "main.go";
    },
    keywords: ["entry", "main", "go", "golang", "entrypoint"],
    dynamicKeywords: (filepath) => {
      const parent = getParentFolder(filepath);
      // cmd/myapp/main.go -> "myapp"
      if (parent && !["cmd", "src", ".", ""].includes(parent)) {
        return [parent.toLowerCase()];
      }
      return [];
    },
  },

  // ============================================================================
  // Python Entry Points
  // ============================================================================
  {
    id: "python-main",
    name: "Python Main Module",
    description: "Python package main entry point",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "__main__.py";
    },
    keywords: ["entry", "main", "python", "entrypoint", "cli"],
    dynamicKeywords: (filepath) => {
      const parent = getParentFolder(filepath);
      if (["src", "lib", ".", ""].includes(parent)) {
        return [];
      }
      return [parent.toLowerCase()];
    },
  },
  {
    id: "python-app",
    name: "Python App Entry",
    description: "Common Python application entry points",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "app.py" || filename === "main.py" || filename === "run.py";
    },
    keywords: ["entry", "main", "python", "app", "entrypoint"],
  },
  {
    id: "python-manage",
    name: "Django Manage",
    description: "Django management script",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "manage.py";
    },
    keywords: ["entry", "django", "python", "manage", "cli", "admin"],
  },
  {
    id: "python-wsgi",
    name: "Python WSGI Entry",
    description: "Python WSGI application entry point",
    category: "entry-point",
    match: (filepath, filename) => {
      return filename === "wsgi.py" || filename === "asgi.py";
    },
    keywords: ["entry", "wsgi", "asgi", "python", "server", "web"],
  },
];
