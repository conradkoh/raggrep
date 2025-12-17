/**
 * Tests for the Rust Language Module
 */
import { describe, expect, it } from "bun:test";
import { isRustFile, RUST_EXTENSIONS, RustModule } from "./index";

describe("Rust Module", () => {
  describe("isRustFile", () => {
    it("should return true for .rs files", () => {
      expect(isRustFile("main.rs")).toBe(true);
      expect(isRustFile("lib.rs")).toBe(true);
      expect(isRustFile("/path/to/file.rs")).toBe(true);
    });

    it("should return false for non-Rust files", () => {
      expect(isRustFile("main.py")).toBe(false);
      expect(isRustFile("main.go")).toBe(false);
      expect(isRustFile("main.ts")).toBe(false);
      expect(isRustFile("main.rs.bak")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isRustFile("main.RS")).toBe(true);
      expect(isRustFile("main.Rs")).toBe(true);
    });
  });

  describe("RUST_EXTENSIONS", () => {
    it("should include .rs", () => {
      expect(RUST_EXTENSIONS).toContain(".rs");
    });
  });

  describe("RustModule class", () => {
    it("should have correct metadata", () => {
      const module = new RustModule();
      expect(module.id).toBe("language/rust");
      expect(module.name).toBe("Rust Search");
      expect(module.version).toBe("1.0.0");
    });

    it("should support Rust files", () => {
      const module = new RustModule();
      expect(module.supportsFile("main.rs")).toBe(true);
      expect(module.supportsFile("lib.rs")).toBe(true);
    });

    it("should not support non-Rust files", () => {
      const module = new RustModule();
      expect(module.supportsFile("main.py")).toBe(false);
      expect(module.supportsFile("main.ts")).toBe(false);
    });
  });
});

