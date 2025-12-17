/**
 * Tests for the Go Language Module
 */
import { describe, expect, it } from "bun:test";
import { isGoFile, GO_EXTENSIONS, GoModule } from "./index";

describe("Go Module", () => {
  describe("isGoFile", () => {
    it("should return true for .go files", () => {
      expect(isGoFile("main.go")).toBe(true);
      expect(isGoFile("handler.go")).toBe(true);
      expect(isGoFile("/path/to/file.go")).toBe(true);
    });

    it("should return false for non-Go files", () => {
      expect(isGoFile("main.py")).toBe(false);
      expect(isGoFile("main.rs")).toBe(false);
      expect(isGoFile("main.ts")).toBe(false);
      expect(isGoFile("main.go.bak")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isGoFile("main.GO")).toBe(true);
      expect(isGoFile("main.Go")).toBe(true);
    });
  });

  describe("GO_EXTENSIONS", () => {
    it("should include .go", () => {
      expect(GO_EXTENSIONS).toContain(".go");
    });
  });

  describe("GoModule class", () => {
    it("should have correct metadata", () => {
      const module = new GoModule();
      expect(module.id).toBe("language/go");
      expect(module.name).toBe("Go Search");
      expect(module.version).toBe("1.0.0");
    });

    it("should support Go files", () => {
      const module = new GoModule();
      expect(module.supportsFile("main.go")).toBe(true);
      expect(module.supportsFile("handler.go")).toBe(true);
    });

    it("should not support non-Go files", () => {
      const module = new GoModule();
      expect(module.supportsFile("main.py")).toBe(false);
      expect(module.supportsFile("main.ts")).toBe(false);
    });
  });
});

