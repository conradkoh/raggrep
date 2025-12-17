/**
 * Configuration Validator
 *
 * Validates RAGgrep configuration for correctness and provides
 * helpful error messages for invalid configurations.
 */

import type { Config, ModuleConfig } from "../entities/config";

/**
 * Validation result for a single field or section.
 */
export interface ValidationIssue {
  /** The path to the invalid field (e.g., "modules[0].id") */
  path: string;

  /** The type of issue: error (invalid), warning (suboptimal), info (suggestion) */
  severity: "error" | "warning" | "info";

  /** Human-readable description of the issue */
  message: string;

  /** Suggested fix (optional) */
  suggestion?: string;
}

/**
 * Overall validation result.
 */
export interface ValidationResult {
  /** Whether the configuration is valid (no errors) */
  valid: boolean;

  /** List of all issues found */
  issues: ValidationIssue[];

  /** Helper method to get issues by severity */
  getErrors(): ValidationIssue[];
  getWarnings(): ValidationIssue[];
  getInfos(): ValidationIssue[];
}

/**
 * Known module IDs in the system.
 */
const KNOWN_MODULE_IDS = [
  "core",
  "language/typescript",
  "language/python",
  "language/go",
  "language/rust",
  "data/json",
  "docs/markdown",
];

/**
 * Supported embedding models.
 */
const KNOWN_EMBEDDING_MODELS = [
  "all-MiniLM-L6-v2",
  "all-mpnet-base-v2",
  "paraphrase-MiniLM-L6-v2",
];

/**
 * Validate a RAGgrep configuration.
 *
 * @param config - The configuration to validate
 * @returns Validation result with any issues found
 */
export function validateConfig(config: Config): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Validate version
  if (!config.version) {
    issues.push({
      path: "version",
      severity: "error",
      message: "Configuration version is required",
      suggestion: "Add a version field (e.g., '0.1.0')",
    });
  } else if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
    issues.push({
      path: "version",
      severity: "warning",
      message: `Version '${config.version}' is not in semver format`,
      suggestion: "Use semantic versioning (e.g., '0.1.0')",
    });
  }

  // Validate indexDir
  if (!config.indexDir) {
    issues.push({
      path: "indexDir",
      severity: "error",
      message: "Index directory is required",
      suggestion: "Set indexDir to '.raggrep' (default)",
    });
  } else if (config.indexDir.startsWith("/")) {
    issues.push({
      path: "indexDir",
      severity: "warning",
      message: "Index directory should be relative to project root",
      suggestion: "Use a relative path like '.raggrep'",
    });
  }

  // Validate extensions
  if (!config.extensions || config.extensions.length === 0) {
    issues.push({
      path: "extensions",
      severity: "warning",
      message: "No file extensions configured",
      suggestion:
        "Add extensions to index (e.g., ['.ts', '.js', '.py', '.md'])",
    });
  } else {
    for (let i = 0; i < config.extensions.length; i++) {
      const ext = config.extensions[i];
      if (!ext.startsWith(".")) {
        issues.push({
          path: `extensions[${i}]`,
          severity: "error",
          message: `Extension '${ext}' must start with a dot`,
          suggestion: `Use '.${ext}' instead`,
        });
      }
    }
  }

  // Validate ignorePaths
  if (config.ignorePaths) {
    for (let i = 0; i < config.ignorePaths.length; i++) {
      const ignorePath = config.ignorePaths[i];
      if (ignorePath.includes("..")) {
        issues.push({
          path: `ignorePaths[${i}]`,
          severity: "warning",
          message: `Ignore path '${ignorePath}' contains '..' which may behave unexpectedly`,
        });
      }
    }
  }

  // Validate modules
  if (!config.modules || config.modules.length === 0) {
    issues.push({
      path: "modules",
      severity: "error",
      message: "At least one module must be configured",
      suggestion: "Add the 'core' module at minimum",
    });
  } else {
    validateModules(config.modules, issues);
  }

  return createValidationResult(issues);
}

/**
 * Validate module configurations.
 */
function validateModules(
  modules: ModuleConfig[],
  issues: ValidationIssue[]
): void {
  const seenIds = new Set<string>();
  let hasEnabledModule = false;

  for (let i = 0; i < modules.length; i++) {
    const module = modules[i];
    const basePath = `modules[${i}]`;

    // Validate module ID
    if (!module.id) {
      issues.push({
        path: `${basePath}.id`,
        severity: "error",
        message: "Module ID is required",
      });
      continue;
    }

    // Check for duplicate IDs
    if (seenIds.has(module.id)) {
      issues.push({
        path: `${basePath}.id`,
        severity: "error",
        message: `Duplicate module ID: '${module.id}'`,
        suggestion: "Each module should only appear once",
      });
    }
    seenIds.add(module.id);

    // Check for unknown module IDs
    if (!KNOWN_MODULE_IDS.includes(module.id)) {
      issues.push({
        path: `${basePath}.id`,
        severity: "warning",
        message: `Unknown module ID: '${module.id}'`,
        suggestion: `Known modules: ${KNOWN_MODULE_IDS.join(", ")}`,
      });
    }

    // Track enabled modules
    if (module.enabled) {
      hasEnabledModule = true;
    }

    // Validate module options
    if (module.options) {
      validateModuleOptions(module.id, module.options, `${basePath}.options`, issues);
    }
  }

  // Warn if no modules are enabled
  if (!hasEnabledModule) {
    issues.push({
      path: "modules",
      severity: "warning",
      message: "No modules are enabled",
      suggestion: "Enable at least the 'core' module",
    });
  }
}

/**
 * Validate module-specific options.
 */
function validateModuleOptions(
  moduleId: string,
  options: Record<string, unknown>,
  basePath: string,
  issues: ValidationIssue[]
): void {
  // Validate embedding model for language modules
  if (
    moduleId.startsWith("language/") ||
    moduleId === "data/json" ||
    moduleId === "docs/markdown"
  ) {
    const embeddingModel = options.embeddingModel as string | undefined;
    if (embeddingModel && !KNOWN_EMBEDDING_MODELS.includes(embeddingModel)) {
      issues.push({
        path: `${basePath}.embeddingModel`,
        severity: "info",
        message: `Embedding model '${embeddingModel}' is not in the known list`,
        suggestion: `Known models: ${KNOWN_EMBEDDING_MODELS.join(", ")}. Custom models may work if available.`,
      });
    }
  }

  // Validate vocabulary/synonym options if present
  if (options.vocabularyExpansion !== undefined) {
    const level = options.vocabularyExpansion as string;
    const validLevels = ["conservative", "moderate", "aggressive", "none"];
    if (!validLevels.includes(level)) {
      issues.push({
        path: `${basePath}.vocabularyExpansion`,
        severity: "error",
        message: `Invalid vocabulary expansion level: '${level}'`,
        suggestion: `Valid levels: ${validLevels.join(", ")}`,
      });
    }
  }
}

/**
 * Create a validation result object with helper methods.
 */
function createValidationResult(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  return {
    valid: errors.length === 0,
    issues,
    getErrors: () => errors,
    getWarnings: () => warnings,
    getInfos: () => infos,
  };
}

/**
 * Format validation issues for display.
 */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return "Configuration is valid.";
  }

  const lines: string[] = [];

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  if (errors.length > 0) {
    lines.push("ERRORS:");
    for (const issue of errors) {
      lines.push(`  ✗ ${issue.path}: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    → ${issue.suggestion}`);
      }
    }
  }

  if (warnings.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("WARNINGS:");
    for (const issue of warnings) {
      lines.push(`  ⚠ ${issue.path}: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    → ${issue.suggestion}`);
      }
    }
  }

  if (infos.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("INFO:");
    for (const issue of infos) {
      lines.push(`  ℹ ${issue.path}: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    → ${issue.suggestion}`);
      }
    }
  }

  return lines.join("\n");
}

