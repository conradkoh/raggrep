/**
 * Next.js Framework Conventions
 *
 * Patterns for recognizing Next.js specific files and structures.
 */

import type { FileConvention, FrameworkConventions } from "../types";

const nextjsConventions: FileConvention[] = [
  // ============================================================================
  // Configuration
  // ============================================================================
  {
    id: "next-config",
    name: "Next.js Config",
    description: "Next.js framework configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "next.config.js" ||
      filename === "next.config.mjs" ||
      filename === "next.config.ts",
    keywords: ["nextjs", "next", "config", "framework", "settings"],
  },
  {
    id: "next-env",
    name: "Next.js Environment Types",
    description: "Next.js TypeScript environment declarations",
    category: "types",
    match: (filepath, filename) => filename === "next-env.d.ts",
    keywords: ["nextjs", "types", "typescript", "declarations"],
  },

  // ============================================================================
  // App Router (Next.js 13+)
  // ============================================================================
  {
    id: "next-layout",
    name: "Next.js Layout",
    description: "Next.js layout component (App Router)",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "layout.tsx" || filename === "layout.js") &&
      (filepath.includes("/app/") || filepath.startsWith("app/")),
    keywords: ["nextjs", "layout", "wrapper", "template", "app router"],
    dynamicKeywords: (filepath) => {
      // Extract route segment from path
      const match = filepath.match(/app\/(.+?)\/layout\./);
      if (match) {
        const segments = match[1]
          .split("/")
          .filter((s) => !s.startsWith("(") && !s.startsWith("["));
        return segments.map((s) => s.toLowerCase());
      }
      if (filepath === "app/layout.tsx" || filepath === "app/layout.js") {
        return ["root", "main"];
      }
      return [];
    },
  },
  {
    id: "next-page",
    name: "Next.js Page",
    description: "Next.js page component (App Router)",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "page.tsx" || filename === "page.js") &&
      (filepath.includes("/app/") || filepath.startsWith("app/")),
    keywords: ["nextjs", "page", "route", "view", "app router"],
    dynamicKeywords: (filepath) => {
      // Extract route from path
      const match = filepath.match(/app\/(.+?)\/page\./);
      if (match) {
        const segments = match[1]
          .split("/")
          .filter((s) => !s.startsWith("("))
          .map((s) => s.replace(/^\[(.+?)\]$/, "$1")); // [id] -> id
        return segments.map((s) => s.toLowerCase());
      }
      if (filepath === "app/page.tsx" || filepath === "app/page.js") {
        return ["home", "index", "root"];
      }
      return [];
    },
  },
  {
    id: "next-loading",
    name: "Next.js Loading",
    description: "Next.js loading UI component",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "loading.tsx" || filename === "loading.js") &&
      (filepath.includes("/app/") || filepath.startsWith("app/")),
    keywords: ["nextjs", "loading", "suspense", "skeleton", "spinner"],
  },
  {
    id: "next-error",
    name: "Next.js Error",
    description: "Next.js error boundary component",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "error.tsx" || filename === "error.js") &&
      (filepath.includes("/app/") || filepath.startsWith("app/")),
    keywords: ["nextjs", "error", "boundary", "fallback", "catch"],
  },
  {
    id: "next-not-found",
    name: "Next.js Not Found",
    description: "Next.js 404 page component",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "not-found.tsx" || filename === "not-found.js") &&
      (filepath.includes("/app/") || filepath.startsWith("app/")),
    keywords: ["nextjs", "404", "not found", "missing", "error"],
  },
  {
    id: "next-template",
    name: "Next.js Template",
    description: "Next.js template component",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "template.tsx" || filename === "template.js") &&
      (filepath.includes("/app/") || filepath.startsWith("app/")),
    keywords: ["nextjs", "template", "wrapper", "app router"],
  },

  // ============================================================================
  // API Routes (App Router)
  // ============================================================================
  {
    id: "next-route-handler",
    name: "Next.js Route Handler",
    description: "Next.js API route handler (App Router)",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "route.ts" || filename === "route.js") &&
      (filepath.includes("/app/") || filepath.startsWith("app/")),
    keywords: ["nextjs", "api", "route", "handler", "endpoint", "rest"],
    dynamicKeywords: (filepath) => {
      // Extract API path
      const match = filepath.match(/app\/api\/(.+?)\/route\./);
      if (match) {
        const segments = match[1]
          .split("/")
          .filter((s) => !s.startsWith("("))
          .map((s) => s.replace(/^\[(.+?)\]$/, "$1"));
        return ["api", ...segments.map((s) => s.toLowerCase())];
      }
      return ["api"];
    },
  },

  // ============================================================================
  // Middleware & Special Files
  // ============================================================================
  {
    id: "next-middleware",
    name: "Next.js Middleware",
    description: "Next.js edge middleware",
    category: "framework",
    match: (filepath, filename) =>
      filename === "middleware.ts" || filename === "middleware.js",
    keywords: ["nextjs", "middleware", "edge", "request", "interceptor"],
  },
  {
    id: "next-global-error",
    name: "Next.js Global Error",
    description: "Next.js global error handler",
    category: "framework",
    match: (filepath, filename) =>
      filename === "global-error.tsx" || filename === "global-error.js",
    keywords: ["nextjs", "error", "global", "boundary", "catch"],
  },

  // ============================================================================
  // Pages Router (Legacy)
  // ============================================================================
  {
    id: "next-pages-api",
    name: "Next.js API Route (Pages)",
    description: "Next.js API route (Pages Router)",
    category: "framework",
    match: (filepath) =>
      filepath.includes("/pages/api/") || filepath.startsWith("pages/api/"),
    keywords: ["nextjs", "api", "route", "handler", "endpoint", "pages router"],
    dynamicKeywords: (filepath) => {
      const match = filepath.match(/pages\/api\/(.+?)\.(ts|js)/);
      if (match) {
        const segments = match[1]
          .split("/")
          .map((s) => s.replace(/^\[(.+?)\]$/, "$1"));
        return ["api", ...segments.map((s) => s.toLowerCase())];
      }
      return ["api"];
    },
  },
  {
    id: "next-pages-document",
    name: "Next.js Document",
    description: "Next.js custom document (Pages Router)",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "_document.tsx" || filename === "_document.js") &&
      (filepath.includes("/pages/") || filepath.startsWith("pages/")),
    keywords: ["nextjs", "document", "html", "head", "body", "pages router"],
  },
  {
    id: "next-pages-app",
    name: "Next.js App (Pages)",
    description: "Next.js custom app (Pages Router)",
    category: "framework",
    match: (filepath, filename) =>
      (filename === "_app.tsx" || filename === "_app.js") &&
      (filepath.includes("/pages/") || filepath.startsWith("pages/")),
    keywords: ["nextjs", "app", "wrapper", "provider", "pages router"],
  },
];

/**
 * Next.js framework conventions provider.
 */
export const nextjsFramework: FrameworkConventions = {
  id: "nextjs",
  name: "Next.js",
  detect: (filepath) => {
    // Detect if this is likely a Next.js project
    return (
      filepath === "next.config.js" ||
      filepath === "next.config.mjs" ||
      filepath === "next.config.ts" ||
      filepath.includes("/app/page.") ||
      filepath.includes("/pages/_app.")
    );
  },
  conventions: nextjsConventions,
};
