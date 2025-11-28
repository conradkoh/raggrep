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
];
