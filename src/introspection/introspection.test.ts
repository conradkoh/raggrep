/**
 * Tests for Introspection Module
 */

import { test, expect, describe } from "bun:test";
import { introspectFile, introspectionToKeywords } from "./fileIntrospector";
import { detectScopeFromName, findProjectForFile } from "./projectDetector";
import { calculateIntrospectionBoost } from "./index";
import type { ProjectStructure } from "./types";

// Mock project structure for testing
const mockStructure: ProjectStructure = {
  projects: [
    { name: "webapp", root: "apps/webapp", type: "app" },
    { name: "api", root: "apps/api", type: "app" },
    { name: "shared", root: "packages/shared", type: "library" },
  ],
  isMonorepo: true,
};

const singleProjectStructure: ProjectStructure = {
  projects: [],
  isMonorepo: false,
  rootType: "app",
};

describe("detectScopeFromName", () => {
  test("detects frontend from name", () => {
    expect(detectScopeFromName("webapp")).toBe("frontend");
    expect(detectScopeFromName("my-client")).toBe("frontend");
    expect(detectScopeFromName("react-ui")).toBe("frontend");
  });

  test("detects backend from name", () => {
    expect(detectScopeFromName("api")).toBe("backend");
    expect(detectScopeFromName("my-server")).toBe("backend");
    expect(detectScopeFromName("worker-service")).toBe("backend");
  });

  test("detects shared from name", () => {
    expect(detectScopeFromName("shared")).toBe("shared");
    expect(detectScopeFromName("common-utils")).toBe("shared");
  });

  test("returns unknown for ambiguous names", () => {
    expect(detectScopeFromName("my-project")).toBe("unknown");
  });
});

describe("findProjectForFile", () => {
  test("finds project for monorepo file", () => {
    const project = findProjectForFile("apps/webapp/src/index.ts", mockStructure);
    expect(project.name).toBe("webapp");
    expect(project.root).toBe("apps/webapp");
  });

  test("returns root for non-monorepo file", () => {
    const project = findProjectForFile("src/index.ts", singleProjectStructure);
    expect(project.name).toBe("root");
  });
});

describe("introspectFile", () => {
  test("extracts basic metadata", () => {
    const intro = introspectFile(
      "src/auth/authService.ts",
      singleProjectStructure
    );

    expect(intro.filepath).toBe("src/auth/authService.ts");
    expect(intro.language).toBe("typescript");
    expect(intro.layer).toBe("service");
    expect(intro.domain).toBe("auth");
    expect(intro.depth).toBe(2);
  });

  test("detects controller layer", () => {
    const intro = introspectFile(
      "src/api/userController.ts",
      singleProjectStructure
    );
    expect(intro.layer).toBe("controller");
  });

  test("detects repository layer", () => {
    const intro = introspectFile(
      "src/users/userRepository.ts",
      singleProjectStructure
    );
    expect(intro.layer).toBe("repository");
  });

  test("detects model layer from path", () => {
    const intro = introspectFile("src/models/User.ts", singleProjectStructure);
    expect(intro.layer).toBe("model");
  });

  test("detects domain from path", () => {
    const intro = introspectFile(
      "src/users/types.ts",
      singleProjectStructure
    );
    expect(intro.domain).toBe("users");
  });

  test("detects test layer", () => {
    const intro = introspectFile(
      "src/__tests__/auth.test.ts",
      singleProjectStructure
    );
    expect(intro.layer).toBe("test");
  });

  test("extracts path segments", () => {
    const intro = introspectFile(
      "src/features/auth/login.ts",
      singleProjectStructure
    );
    expect(intro.pathSegments).toEqual(["src", "features", "auth"]);
  });

  test("detects language from extension", () => {
    expect(
      introspectFile("index.js", singleProjectStructure).language
    ).toBe("javascript");
    expect(
      introspectFile("main.py", singleProjectStructure).language
    ).toBe("python");
    expect(
      introspectFile("lib.rs", singleProjectStructure).language
    ).toBe("rust");
    expect(
      introspectFile("app.go", singleProjectStructure).language
    ).toBe("go");
  });

  test("detects framework from content", () => {
    const content = `import express from 'express';`;
    const intro = introspectFile("src/server.ts", singleProjectStructure, content);
    expect(intro.framework).toBe("express");
  });

  test("handles monorepo structure", () => {
    const intro = introspectFile("apps/webapp/src/index.ts", mockStructure);
    expect(intro.project.name).toBe("webapp");
    expect(intro.project.type).toBe("app");
    expect(intro.scope).toBe("frontend");
  });
});

describe("introspectionToKeywords", () => {
  test("generates keywords from introspection", () => {
    const intro = introspectFile(
      "src/auth/authService.ts",
      singleProjectStructure
    );
    const keywords = introspectionToKeywords(intro);

    expect(keywords).toContain("service");
    expect(keywords).toContain("auth");
    expect(keywords).toContain("typescript");
  });

  test("includes project name for monorepo", () => {
    const intro = introspectFile("apps/api/src/index.ts", mockStructure);
    const keywords = introspectionToKeywords(intro);
    expect(keywords).toContain("api");
  });

  test("excludes common path segments but includes filename", () => {
    const intro = introspectFile("src/index.ts", singleProjectStructure);
    const keywords = introspectionToKeywords(intro);
    // "src" is excluded as a common path segment
    expect(keywords).not.toContain("src");
    // "index" is included because it's the filename (filename keywords are always included)
    expect(keywords).toContain("index");
  });

  test("includes filename keywords", () => {
    const intro = introspectFile("src/userService.ts", singleProjectStructure);
    const keywords = introspectionToKeywords(intro);
    // Filename "userService" should be split into "user" and "service"
    expect(keywords).toContain("user");
    expect(keywords).toContain("service");
    expect(keywords).toContain("userservice"); // full filename without extension
  });
});

describe("calculateIntrospectionBoost", () => {
  test("boosts for domain match", () => {
    const intro = introspectFile(
      "src/auth/authService.ts",
      singleProjectStructure
    );
    const boost = calculateIntrospectionBoost(intro, "authentication login");
    expect(boost).toBeGreaterThan(1.0);
  });

  test("boosts for layer match", () => {
    const intro = introspectFile(
      "src/api/userController.ts",
      singleProjectStructure
    );
    const boost = calculateIntrospectionBoost(intro, "api controller");
    expect(boost).toBeGreaterThan(1.0);
  });

  test("boosts for backend scope match", () => {
    const intro = introspectFile(
      "src/api/userController.ts",
      singleProjectStructure
    );
    // Controller implies backend
    const boost = calculateIntrospectionBoost(intro, "api endpoint");
    expect(boost).toBeGreaterThan(1.0);
  });

  test("no boost for unrelated query", () => {
    const intro = introspectFile(
      "src/auth/authService.ts",
      singleProjectStructure
    );
    const boost = calculateIntrospectionBoost(intro, "payment processing");
    expect(boost).toBe(1.0);
  });
});

