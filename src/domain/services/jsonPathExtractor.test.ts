/**
 * JSON Path Extractor Tests
 */

import { describe, expect, test } from "bun:test";
import { extractJsonPaths, extractJsonKeywords } from "./jsonPathExtractor";

describe("extractJsonPaths", () => {
  test("extracts paths from simple object", () => {
    const obj = {
      port: 3000,
      host: "localhost",
    };

    const literals = extractJsonPaths(obj, "config");

    expect(literals).toHaveLength(2);
    expect(literals.map((l) => l.value)).toContain("config.port");
    expect(literals.map((l) => l.value)).toContain("config.host");

    // All should be definition type
    literals.forEach((l) => {
      expect(l.type).toBe("identifier");
      expect(l.matchType).toBe("definition");
    });
  });

  test("extracts paths from nested object", () => {
    const obj = {
      name: {
        first: "john",
        last: "doe",
      },
      email: "john@example.com",
    };

    const literals = extractJsonPaths(obj, "user");
    const paths = literals.map((l) => l.value);

    expect(paths).toContain("user.name");
    expect(paths).toContain("user.name.first");
    expect(paths).toContain("user.name.last");
    expect(paths).toContain("user.email");
  });

  test("extracts paths from deeply nested object", () => {
    const obj = {
      database: {
        connection: {
          host: "localhost",
          port: 5432,
        },
      },
    };

    const literals = extractJsonPaths(obj, "settings");
    const paths = literals.map((l) => l.value);

    expect(paths).toContain("settings.database");
    expect(paths).toContain("settings.database.connection");
    expect(paths).toContain("settings.database.connection.host");
    expect(paths).toContain("settings.database.connection.port");
  });

  test("extracts paths from arrays with indexed notation", () => {
    const obj = {
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    };

    const literals = extractJsonPaths(obj, "data");
    const paths = literals.map((l) => l.value);

    expect(paths).toContain("data.users");
    expect(paths).toContain("data.users[0]");
    expect(paths).toContain("data.users[0].id");
    expect(paths).toContain("data.users[0].name");
    expect(paths).toContain("data.users[1]");
    expect(paths).toContain("data.users[1].id");
    expect(paths).toContain("data.users[1].name");
  });

  test("extracts paths from array of primitives", () => {
    const obj = {
      tags: ["typescript", "javascript", "react"],
    };

    const literals = extractJsonPaths(obj, "project");
    const paths = literals.map((l) => l.value);

    expect(paths).toContain("project.tags");
    expect(paths).toContain("project.tags[0]");
    expect(paths).toContain("project.tags[1]");
    expect(paths).toContain("project.tags[2]");
  });

  test("handles empty object", () => {
    const literals = extractJsonPaths({}, "empty");
    expect(literals).toHaveLength(0);
  });

  test("handles null input", () => {
    const literals = extractJsonPaths(null, "test");
    expect(literals).toHaveLength(0);
  });

  test("handles undefined input", () => {
    const literals = extractJsonPaths(undefined, "test");
    expect(literals).toHaveLength(0);
  });

  test("handles object with null values", () => {
    const obj = {
      name: null,
      active: true,
    };

    const literals = extractJsonPaths(obj, "config");
    const paths = literals.map((l) => l.value);

    expect(paths).toContain("config.name");
    expect(paths).toContain("config.active");
  });

  test("package.json example", () => {
    const obj = {
      name: "my-app",
      version: "1.0.0",
      dependencies: {
        react: "^18.0.0",
        typescript: "^5.0.0",
      },
      scripts: {
        build: "tsc",
        test: "vitest",
      },
    };

    const literals = extractJsonPaths(obj, "package");
    const paths = literals.map((l) => l.value);

    expect(paths).toContain("package.name");
    expect(paths).toContain("package.version");
    expect(paths).toContain("package.dependencies");
    expect(paths).toContain("package.dependencies.react");
    expect(paths).toContain("package.dependencies.typescript");
    expect(paths).toContain("package.scripts");
    expect(paths).toContain("package.scripts.build");
    expect(paths).toContain("package.scripts.test");
  });
});

describe("extractJsonKeywords", () => {
  test("extracts keys as keywords", () => {
    const obj = {
      userName: "john",
      email: "john@example.com",
    };

    const keywords = extractJsonKeywords(obj);

    expect(keywords).toContain("username");
    expect(keywords).toContain("user");
    expect(keywords).toContain("name");
    expect(keywords).toContain("email");
  });

  test("extracts string values as keywords", () => {
    const obj = {
      type: "UserService",
      description: "handles user authentication",
    };

    const keywords = extractJsonKeywords(obj);

    expect(keywords).toContain("user");
    expect(keywords).toContain("service");
    expect(keywords).toContain("handles");
    expect(keywords).toContain("authentication");
  });

  test("handles nested objects", () => {
    const obj = {
      database: {
        connectionString: "postgres://localhost",
      },
    };

    const keywords = extractJsonKeywords(obj);

    expect(keywords).toContain("database");
    expect(keywords).toContain("connectionstring");
    expect(keywords).toContain("connection");
    expect(keywords).toContain("string");
  });

  test("handles arrays", () => {
    const obj = {
      features: ["darkMode", "lightTheme"],
    };

    const keywords = extractJsonKeywords(obj);

    expect(keywords).toContain("features");
    expect(keywords).toContain("dark");
    expect(keywords).toContain("mode");
    expect(keywords).toContain("light");
    expect(keywords).toContain("theme");
  });
});
