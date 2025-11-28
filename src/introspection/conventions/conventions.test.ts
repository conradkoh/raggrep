/**
 * Tests for File Conventions Module
 */

import { test, expect, describe } from "bun:test";
import { getConventionKeywords, matchConventions } from "./index";

describe("getConventionKeywords", () => {
  // ============================================================================
  // Entry Points
  // ============================================================================
  describe("entry points", () => {
    test("recognizes index.ts as entry point with parent folder keyword", () => {
      const keywords = getConventionKeywords("src/auth/index.ts");
      expect(keywords).toContain("entry");
      expect(keywords).toContain("barrel");
      expect(keywords).toContain("module");
      expect(keywords).toContain("auth"); // Parent folder
    });

    test("recognizes main.ts as entry point", () => {
      const keywords = getConventionKeywords("src/main.ts");
      expect(keywords).toContain("entry");
      expect(keywords).toContain("main");
      expect(keywords).toContain("entrypoint");
    });

    test("recognizes App.tsx as root component", () => {
      const keywords = getConventionKeywords("src/App.tsx");
      expect(keywords).toContain("root");
      expect(keywords).toContain("app");
      expect(keywords).toContain("application");
    });

    test("does not add generic parent folders for index files", () => {
      const keywords = getConventionKeywords("src/index.ts");
      expect(keywords).toContain("entry");
      expect(keywords).not.toContain("src"); // Filtered out
    });
  });

  // ============================================================================
  // Configuration Files
  // ============================================================================
  describe("configuration files", () => {
    test("recognizes tsconfig.json", () => {
      const keywords = getConventionKeywords("tsconfig.json");
      expect(keywords).toContain("typescript");
      expect(keywords).toContain("config");
      expect(keywords).toContain("compiler");
    });

    test("recognizes package.json", () => {
      const keywords = getConventionKeywords("package.json");
      expect(keywords).toContain("package");
      expect(keywords).toContain("dependencies");
      expect(keywords).toContain("npm");
    });

    test("recognizes .prettierrc", () => {
      const keywords = getConventionKeywords(".prettierrc");
      expect(keywords).toContain("prettier");
      expect(keywords).toContain("formatting");
    });

    test("recognizes eslint.config.js", () => {
      const keywords = getConventionKeywords("eslint.config.js");
      expect(keywords).toContain("eslint");
      expect(keywords).toContain("linting");
    });

    test("recognizes vite.config.ts", () => {
      const keywords = getConventionKeywords("vite.config.ts");
      expect(keywords).toContain("vite");
      expect(keywords).toContain("bundler");
      expect(keywords).toContain("build");
    });

    test("recognizes jest.config.js", () => {
      const keywords = getConventionKeywords("jest.config.js");
      expect(keywords).toContain("jest");
      expect(keywords).toContain("testing");
    });

    test("recognizes tailwind.config.js", () => {
      const keywords = getConventionKeywords("tailwind.config.js");
      expect(keywords).toContain("tailwind");
      expect(keywords).toContain("css");
      expect(keywords).toContain("styling");
    });

    test("recognizes .env files", () => {
      const keywords = getConventionKeywords(".env.local");
      expect(keywords).toContain("environment");
      expect(keywords).toContain("env");
      expect(keywords).toContain("variables");
    });

    test("recognizes Dockerfile", () => {
      const keywords = getConventionKeywords("Dockerfile");
      expect(keywords).toContain("docker");
      expect(keywords).toContain("container");
    });

    test("recognizes docker-compose.yml", () => {
      const keywords = getConventionKeywords("docker-compose.yml");
      expect(keywords).toContain("docker");
      expect(keywords).toContain("compose");
      expect(keywords).toContain("containers");
    });

    test("recognizes pnpm-workspace.yaml", () => {
      const keywords = getConventionKeywords("pnpm-workspace.yaml");
      expect(keywords).toContain("workspace");
      expect(keywords).toContain("monorepo");
      expect(keywords).toContain("pnpm");
    });
  });

  // ============================================================================
  // Next.js
  // ============================================================================
  describe("Next.js framework", () => {
    test("recognizes next.config.js", () => {
      const keywords = getConventionKeywords("next.config.js");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("config");
      expect(keywords).toContain("framework");
    });

    test("recognizes app/layout.tsx", () => {
      const keywords = getConventionKeywords("app/layout.tsx");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("layout");
      expect(keywords).toContain("root");
    });

    test("recognizes app/page.tsx", () => {
      const keywords = getConventionKeywords("app/page.tsx");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("page");
      expect(keywords).toContain("route");
      expect(keywords).toContain("home"); // Dynamic keyword for root page
    });

    test("recognizes nested page with route keywords", () => {
      const keywords = getConventionKeywords("app/dashboard/settings/page.tsx");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("page");
      expect(keywords).toContain("dashboard");
      expect(keywords).toContain("settings");
    });

    test("recognizes API route handlers", () => {
      const keywords = getConventionKeywords("app/api/users/route.ts");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("api");
      expect(keywords).toContain("route");
      expect(keywords).toContain("handler");
      expect(keywords).toContain("users");
    });

    test("recognizes middleware.ts", () => {
      const keywords = getConventionKeywords("middleware.ts");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("middleware");
      expect(keywords).toContain("edge");
    });

    test("recognizes loading.tsx", () => {
      const keywords = getConventionKeywords("app/loading.tsx");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("loading");
      expect(keywords).toContain("suspense");
    });

    test("recognizes error.tsx", () => {
      const keywords = getConventionKeywords("app/error.tsx");
      expect(keywords).toContain("nextjs");
      expect(keywords).toContain("error");
      expect(keywords).toContain("boundary");
    });
  });

  // ============================================================================
  // Convex
  // ============================================================================
  describe("Convex framework", () => {
    test("recognizes convex/schema.ts", () => {
      const keywords = getConventionKeywords("convex/schema.ts");
      expect(keywords).toContain("convex");
      expect(keywords).toContain("schema");
      expect(keywords).toContain("database");
    });

    test("recognizes convex function files", () => {
      const keywords = getConventionKeywords("convex/users.ts");
      expect(keywords).toContain("convex");
      expect(keywords).toContain("function");
      expect(keywords).toContain("backend");
      expect(keywords).toContain("users");
    });

    test("recognizes convex/http.ts", () => {
      const keywords = getConventionKeywords("convex/http.ts");
      expect(keywords).toContain("convex");
      expect(keywords).toContain("http");
      expect(keywords).toContain("routes");
      expect(keywords).toContain("api");
    });

    test("recognizes convex/crons.ts", () => {
      const keywords = getConventionKeywords("convex/crons.ts");
      expect(keywords).toContain("convex");
      expect(keywords).toContain("crons");
      expect(keywords).toContain("scheduled");
    });
  });

  // ============================================================================
  // Type Definitions
  // ============================================================================
  describe("type definitions", () => {
    test("recognizes .d.ts files", () => {
      const keywords = getConventionKeywords("src/global.d.ts");
      expect(keywords).toContain("types");
      expect(keywords).toContain("declarations");
      expect(keywords).toContain("typescript");
    });

    test("recognizes .types.ts files", () => {
      const keywords = getConventionKeywords("src/user.types.ts");
      expect(keywords).toContain("types");
      expect(keywords).toContain("definitions");
      expect(keywords).toContain("user");
    });

    test("recognizes files in types folder", () => {
      const keywords = getConventionKeywords("src/types/api.ts");
      expect(keywords).toContain("types");
      expect(keywords).toContain("definitions");
    });
  });

  // ============================================================================
  // Test Files
  // ============================================================================
  describe("test files", () => {
    test("recognizes .test.ts files", () => {
      const keywords = getConventionKeywords("src/utils.test.ts");
      expect(keywords).toContain("test");
      expect(keywords).toContain("spec");
      expect(keywords).toContain("utils");
    });

    test("recognizes .spec.ts files", () => {
      const keywords = getConventionKeywords("src/auth.spec.ts");
      expect(keywords).toContain("test");
      expect(keywords).toContain("auth");
    });

    test("recognizes files in __tests__ folder", () => {
      const keywords = getConventionKeywords("src/__tests__/helper.ts");
      expect(keywords).toContain("test");
      expect(keywords).toContain("testing");
    });
  });
});

describe("matchConventions", () => {
  test("returns detailed matches for a file", () => {
    const matches = matchConventions("next.config.js");
    expect(matches.length).toBeGreaterThan(0);

    const nextConfigMatch = matches.find(
      (m) => m.convention.id === "next-config"
    );
    expect(nextConfigMatch).toBeDefined();
    expect(nextConfigMatch!.convention.name).toBe("Next.js Config");
    expect(nextConfigMatch!.keywords).toContain("nextjs");
  });

  test("returns multiple matches for files matching multiple conventions", () => {
    // A test file in the convex folder matches both test and convex conventions
    const matches = matchConventions("convex/users.test.ts");

    const hasTestMatch = matches.some((m) => m.convention.category === "test");
    expect(hasTestMatch).toBe(true);
  });
});
