/**
 * Tests for Configuration Validator
 */
import { describe, expect, it } from "bun:test";
import {
  validateConfig,
  formatValidationIssues,
  type ValidationResult,
} from "./configValidator";
import { createDefaultConfig } from "../entities/config";
import type { Config } from "../entities/config";

describe("configValidator", () => {
  describe("validateConfig", () => {
    it("should validate a valid default config", () => {
      const config = createDefaultConfig();
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.getErrors()).toHaveLength(0);
    });

    it("should error on missing version", () => {
      const config = createDefaultConfig();
      config.version = "";

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.getErrors()).toContainEqual(
        expect.objectContaining({
          path: "version",
          severity: "error",
        })
      );
    });

    it("should warn on non-semver version", () => {
      const config = createDefaultConfig();
      config.version = "1.0";

      const result = validateConfig(config);

      expect(result.getWarnings()).toContainEqual(
        expect.objectContaining({
          path: "version",
          message: expect.stringContaining("semver"),
        })
      );
    });

    it("should error on missing indexDir", () => {
      const config = createDefaultConfig();
      config.indexDir = "";

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.getErrors()).toContainEqual(
        expect.objectContaining({
          path: "indexDir",
          severity: "error",
        })
      );
    });

    it("should warn on absolute indexDir", () => {
      const config = createDefaultConfig();
      config.indexDir = "/absolute/path";

      const result = validateConfig(config);

      expect(result.getWarnings()).toContainEqual(
        expect.objectContaining({
          path: "indexDir",
          message: expect.stringContaining("relative"),
        })
      );
    });

    it("should error on extension without leading dot", () => {
      const config = createDefaultConfig();
      config.extensions = ["ts", ".js"];

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.getErrors()).toContainEqual(
        expect.objectContaining({
          path: "extensions[0]",
          message: expect.stringContaining("must start with a dot"),
        })
      );
    });

    it("should warn on empty extensions", () => {
      const config = createDefaultConfig();
      config.extensions = [];

      const result = validateConfig(config);

      expect(result.getWarnings()).toContainEqual(
        expect.objectContaining({
          path: "extensions",
          message: expect.stringContaining("No file extensions"),
        })
      );
    });

    it("should error on empty modules", () => {
      const config = createDefaultConfig();
      config.modules = [];

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.getErrors()).toContainEqual(
        expect.objectContaining({
          path: "modules",
          message: expect.stringContaining("At least one module"),
        })
      );
    });

    it("should error on duplicate module IDs", () => {
      const config = createDefaultConfig();
      config.modules = [
        { id: "core", enabled: true },
        { id: "core", enabled: true },
      ];

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.getErrors()).toContainEqual(
        expect.objectContaining({
          path: "modules[1].id",
          message: expect.stringContaining("Duplicate"),
        })
      );
    });

    it("should warn on unknown module ID", () => {
      const config = createDefaultConfig();
      config.modules = [{ id: "unknown-module", enabled: true }];

      const result = validateConfig(config);

      expect(result.getWarnings()).toContainEqual(
        expect.objectContaining({
          path: "modules[0].id",
          message: expect.stringContaining("Unknown module"),
        })
      );
    });

    it("should warn when no modules are enabled", () => {
      const config = createDefaultConfig();
      config.modules = [
        { id: "core", enabled: false },
        { id: "language/typescript", enabled: false },
      ];

      const result = validateConfig(config);

      expect(result.getWarnings()).toContainEqual(
        expect.objectContaining({
          path: "modules",
          message: expect.stringContaining("No modules are enabled"),
        })
      );
    });

    it("should provide info on unknown embedding model", () => {
      const config = createDefaultConfig();
      config.modules = [
        {
          id: "language/typescript",
          enabled: true,
          options: { embeddingModel: "custom-model-v1" },
        },
      ];

      const result = validateConfig(config);

      expect(result.getInfos()).toContainEqual(
        expect.objectContaining({
          path: "modules[0].options.embeddingModel",
          message: expect.stringContaining("not in the known list"),
        })
      );
    });

    it("should error on invalid vocabulary expansion level", () => {
      const config = createDefaultConfig();
      config.modules = [
        {
          id: "language/typescript",
          enabled: true,
          options: { vocabularyExpansion: "invalid" },
        },
      ];

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.getErrors()).toContainEqual(
        expect.objectContaining({
          path: "modules[0].options.vocabularyExpansion",
          message: expect.stringContaining("Invalid vocabulary expansion"),
        })
      );
    });
  });

  describe("formatValidationIssues", () => {
    it("should return success message for no issues", () => {
      const result = formatValidationIssues([]);
      expect(result).toBe("Configuration is valid.");
    });

    it("should format errors, warnings, and infos separately", () => {
      const issues = [
        { path: "a", severity: "error" as const, message: "Error 1" },
        { path: "b", severity: "warning" as const, message: "Warning 1" },
        { path: "c", severity: "info" as const, message: "Info 1" },
      ];

      const result = formatValidationIssues(issues);

      expect(result).toContain("ERRORS:");
      expect(result).toContain("✗ a: Error 1");
      expect(result).toContain("WARNINGS:");
      expect(result).toContain("⚠ b: Warning 1");
      expect(result).toContain("INFO:");
      expect(result).toContain("ℹ c: Info 1");
    });

    it("should include suggestions when provided", () => {
      const issues = [
        {
          path: "a",
          severity: "error" as const,
          message: "Error 1",
          suggestion: "Try this",
        },
      ];

      const result = formatValidationIssues(issues);

      expect(result).toContain("→ Try this");
    });
  });
});

