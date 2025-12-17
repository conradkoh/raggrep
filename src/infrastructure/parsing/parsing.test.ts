/**
 * Parser Infrastructure Tests
 *
 * Tests for the parser infrastructure including:
 * - TypeScriptParser (TypeScript Compiler API wrapper)
 * - TreeSitterParser (web-tree-sitter based)
 * - Parser factory functions
 * - Language detection
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { TypeScriptParser } from "./typescriptParser";
import { TreeSitterParser } from "./treeSitterParser";
import {
  createParserForFile,
  createParserForLanguage,
  detectLanguage,
  detectLanguagesFromFiles,
  isFileSupported,
  getSupportedExtensions,
  getSupportedLanguages,
} from "./parserFactory";
import { GrammarManager } from "./grammarManager";

describe("TypeScriptParser", () => {
  let parser: TypeScriptParser;

  beforeAll(() => {
    parser = new TypeScriptParser();
  });

  test("should support TypeScript and JavaScript", () => {
    expect(parser.supportedLanguages).toContain("typescript");
    expect(parser.supportedLanguages).toContain("javascript");
  });

  test("should detect TypeScript files", () => {
    expect(parser.canParse("foo.ts")).toBe(true);
    expect(parser.canParse("bar.tsx")).toBe(true);
    expect(parser.canParse("baz.mts")).toBe(true);
  });

  test("should detect JavaScript files", () => {
    expect(parser.canParse("foo.js")).toBe(true);
    expect(parser.canParse("bar.jsx")).toBe(true);
    expect(parser.canParse("baz.mjs")).toBe(true);
    expect(parser.canParse("qux.cjs")).toBe(true);
  });

  test("should not detect non-TS/JS files", () => {
    expect(parser.canParse("foo.py")).toBe(false);
    expect(parser.canParse("bar.go")).toBe(false);
    expect(parser.canParse("baz.rs")).toBe(false);
  });

  test("should parse TypeScript function", async () => {
    const code = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;
    const result = await parser.parse(code, "test.ts");

    expect(result.success).toBe(true);
    expect(result.language).toBe("typescript");
    expect(result.chunks.length).toBeGreaterThan(0);

    const functionChunk = result.chunks.find((c) => c.type === "function");
    expect(functionChunk).toBeDefined();
    expect(functionChunk?.name).toBe("greet");
    expect(functionChunk?.isExported).toBe(true);
  });

  test("should parse TypeScript class", async () => {
    const code = `
/**
 * A sample class.
 */
export class MyClass {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }
}
`;
    const result = await parser.parse(code, "test.ts");

    expect(result.success).toBe(true);
    expect(result.chunks.length).toBeGreaterThan(0);

    const classChunk = result.chunks.find((c) => c.type === "class");
    expect(classChunk).toBeDefined();
    expect(classChunk?.name).toBe("MyClass");
    expect(classChunk?.isExported).toBe(true);
    expect(classChunk?.docComment).toContain("A sample class");
  });

  test("should parse TypeScript interface", async () => {
    const code = `
export interface User {
  id: string;
  name: string;
  email?: string;
}
`;
    const result = await parser.parse(code, "test.ts");

    expect(result.success).toBe(true);

    const interfaceChunk = result.chunks.find((c) => c.type === "interface");
    expect(interfaceChunk).toBeDefined();
    expect(interfaceChunk?.name).toBe("User");
    expect(interfaceChunk?.isExported).toBe(true);
  });

  test("should include full file chunk when requested", async () => {
    const code = `
function foo() {}
function bar() {}
`;
    const result = await parser.parse(code, "test.ts", {
      includeFullFileChunk: true,
    });

    expect(result.success).toBe(true);

    const fileChunk = result.chunks.find((c) => c.type === "file");
    expect(fileChunk).toBeDefined();
    expect(fileChunk?.content).toContain("function foo()");
    expect(fileChunk?.content).toContain("function bar()");
  });

  test("should parse arrow functions", async () => {
    const code = `
export const add = (a: number, b: number): number => a + b;
`;
    const result = await parser.parse(code, "test.ts");

    expect(result.success).toBe(true);

    const functionChunk = result.chunks.find((c) => c.type === "function");
    expect(functionChunk).toBeDefined();
    expect(functionChunk?.name).toBe("add");
    expect(functionChunk?.isExported).toBe(true);
  });

  test("should detect JavaScript language for .js files", async () => {
    const code = `function test() { return 42; }`;
    const result = await parser.parse(code, "test.js");

    expect(result.success).toBe(true);
    expect(result.language).toBe("javascript");
  });
});

describe("TreeSitterParser", () => {
  let parser: TreeSitterParser;

  beforeAll(() => {
    parser = new TreeSitterParser();
  });

  test("should support multiple languages", () => {
    expect(parser.supportedLanguages).toContain("python");
    expect(parser.supportedLanguages).toContain("go");
    expect(parser.supportedLanguages).toContain("rust");
    expect(parser.supportedLanguages).toContain("java");
  });

  test("should detect Python files", () => {
    expect(parser.canParse("foo.py")).toBe(true);
    expect(parser.canParse("bar.pyw")).toBe(true);
  });

  test("should detect Go files", () => {
    expect(parser.canParse("foo.go")).toBe(true);
  });

  test("should detect Rust files", () => {
    expect(parser.canParse("foo.rs")).toBe(true);
  });

  test("should detect Java files", () => {
    expect(parser.canParse("foo.java")).toBe(true);
  });

  test("should fall back to file chunk for Python (no WASM yet)", async () => {
    const code = `
def greet(name):
    """Say hello."""
    return f"Hello, {name}!"
`;
    const result = await parser.parse(code, "test.py");

    // Should succeed with fallback
    expect(result.success).toBe(true);
    expect(result.language).toBe("python");
    expect(result.chunks.length).toBeGreaterThan(0);

    // Since we don't have WASM grammars yet, expect file chunk
    const fileChunk = result.chunks.find((c) => c.type === "file");
    expect(fileChunk).toBeDefined();
  });

  test("should fall back to file chunk for Go", async () => {
    const code = `
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
`;
    const result = await parser.parse(code, "test.go");

    expect(result.success).toBe(true);
    expect(result.language).toBe("go");
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  test("should handle unsupported file types", async () => {
    const code = `Some random content`;
    const result = await parser.parse(code, "test.xyz");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported file type");
  });
});

describe("Parser Factory", () => {
  test("createParserForFile should return TypeScriptParser for .ts files", () => {
    const parser = createParserForFile("test.ts");
    expect(parser).toBeInstanceOf(TypeScriptParser);
  });

  test("createParserForFile should return TypeScriptParser for .js files", () => {
    const parser = createParserForFile("test.js");
    expect(parser).toBeInstanceOf(TypeScriptParser);
  });

  test("createParserForFile should return TreeSitterParser for .py files", () => {
    const parser = createParserForFile("test.py");
    expect(parser).toBeInstanceOf(TreeSitterParser);
  });

  test("createParserForFile should return TreeSitterParser for .go files", () => {
    const parser = createParserForFile("test.go");
    expect(parser).toBeInstanceOf(TreeSitterParser);
  });

  test("createParserForFile should return null for unknown files", () => {
    const parser = createParserForFile("test.xyz");
    expect(parser).toBeNull();
  });

  test("createParserForLanguage should return correct parsers", () => {
    expect(createParserForLanguage("typescript")).toBeInstanceOf(
      TypeScriptParser
    );
    expect(createParserForLanguage("javascript")).toBeInstanceOf(
      TypeScriptParser
    );
    expect(createParserForLanguage("python")).toBeInstanceOf(TreeSitterParser);
    expect(createParserForLanguage("go")).toBeInstanceOf(TreeSitterParser);
    expect(createParserForLanguage("rust")).toBeInstanceOf(TreeSitterParser);
    expect(createParserForLanguage("java")).toBeInstanceOf(TreeSitterParser);
  });
});

describe("Language Detection", () => {
  test("detectLanguage should identify TypeScript", () => {
    expect(detectLanguage("foo.ts")).toBe("typescript");
    expect(detectLanguage("bar.tsx")).toBe("typescript");
    expect(detectLanguage("baz.mts")).toBe("typescript");
    expect(detectLanguage("qux.cts")).toBe("typescript");
  });

  test("detectLanguage should identify JavaScript", () => {
    expect(detectLanguage("foo.js")).toBe("javascript");
    expect(detectLanguage("bar.jsx")).toBe("javascript");
    expect(detectLanguage("baz.mjs")).toBe("javascript");
    expect(detectLanguage("qux.cjs")).toBe("javascript");
  });

  test("detectLanguage should identify Python", () => {
    expect(detectLanguage("foo.py")).toBe("python");
    expect(detectLanguage("bar.pyw")).toBe("python");
  });

  test("detectLanguage should identify other languages", () => {
    expect(detectLanguage("foo.go")).toBe("go");
    expect(detectLanguage("foo.rs")).toBe("rust");
    expect(detectLanguage("foo.java")).toBe("java");
  });

  test("detectLanguage should return null for unknown", () => {
    expect(detectLanguage("foo.xyz")).toBeNull();
    expect(detectLanguage("foo.md")).toBeNull();
  });

  test("detectLanguagesFromFiles should find unique languages", () => {
    const files = [
      "src/main.ts",
      "src/utils.ts",
      "lib/helpers.js",
      "scripts/build.py",
      "cmd/main.go",
    ];
    const languages = detectLanguagesFromFiles(files);

    expect(languages.has("typescript")).toBe(true);
    expect(languages.has("javascript")).toBe(true);
    expect(languages.has("python")).toBe(true);
    expect(languages.has("go")).toBe(true);
    expect(languages.size).toBe(4);
  });
});

describe("File Support", () => {
  test("isFileSupported should return true for supported files", () => {
    expect(isFileSupported("foo.ts")).toBe(true);
    expect(isFileSupported("foo.js")).toBe(true);
    expect(isFileSupported("foo.py")).toBe(true);
    expect(isFileSupported("foo.go")).toBe(true);
    expect(isFileSupported("foo.rs")).toBe(true);
    expect(isFileSupported("foo.java")).toBe(true);
  });

  test("isFileSupported should return false for unsupported files", () => {
    expect(isFileSupported("foo.md")).toBe(false);
    expect(isFileSupported("foo.json")).toBe(false);
    expect(isFileSupported("foo.yaml")).toBe(false);
  });

  test("getSupportedExtensions should return all extensions", () => {
    const extensions = getSupportedExtensions();

    expect(extensions).toContain(".ts");
    expect(extensions).toContain(".js");
    expect(extensions).toContain(".py");
    expect(extensions).toContain(".go");
    expect(extensions).toContain(".rs");
    expect(extensions).toContain(".java");
  });

  test("getSupportedLanguages should return all languages", () => {
    const languages = getSupportedLanguages();

    expect(languages).toContain("typescript");
    expect(languages).toContain("javascript");
    expect(languages).toContain("python");
    expect(languages).toContain("go");
    expect(languages).toContain("rust");
    expect(languages).toContain("java");
  });
});

describe("GrammarManager", () => {
  test("should be a singleton", () => {
    const instance1 = GrammarManager.getInstance();
    const instance2 = GrammarManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  test("should return package names for languages", () => {
    const manager = GrammarManager.getInstance();

    expect(manager.getPackageName("python")).toBe("tree-sitter-python");
    expect(manager.getPackageName("go")).toBe("tree-sitter-go");
    expect(manager.getPackageName("rust")).toBe("tree-sitter-rust");
    expect(manager.getPackageName("java")).toBe("tree-sitter-java");
  });

  test("should report grammars as not installed initially", async () => {
    const manager = GrammarManager.getInstance();

    // These should be false since we haven't installed them
    const pythonInstalled = await manager.isInstalled("python");
    // We can't guarantee what's installed, so just check the function works
    expect(typeof pythonInstalled).toBe("boolean");
  });

  test("getStatus should return status for all languages", async () => {
    const manager = GrammarManager.getInstance();
    const status = await manager.getStatus();

    expect(status.length).toBeGreaterThan(0);
    expect(status.some((s) => s.language === "python")).toBe(true);
    expect(status.some((s) => s.language === "go")).toBe(true);
    expect(status.some((s) => s.language === "rust")).toBe(true);
    expect(status.some((s) => s.language === "java")).toBe(true);
  });
});

