/**
 * Grammar Manager
 *
 * Manages tree-sitter grammar installation and loading.
 * Uses Bun for dynamic package installation on first use.
 *
 * This is an infrastructure component that handles:
 * - Grammar package installation via Bun
 * - Grammar caching in memory
 * - Thread-safe concurrent installation handling
 */

import type {
  IGrammarManager,
  GrammarStatus,
  ParserLanguage,
} from "../../domain/ports/parser";
import type { Logger } from "../../domain/ports/logger";

/**
 * Map from language to tree-sitter grammar package name.
 */
const GRAMMAR_PACKAGES: Record<ParserLanguage, string> = {
  typescript: "tree-sitter-typescript",
  javascript: "tree-sitter-javascript",
  python: "tree-sitter-python",
  go: "tree-sitter-go",
  rust: "tree-sitter-rust",
  java: "tree-sitter-java",
};

/**
 * Map from language to the specific grammar export path.
 * Some packages export multiple languages (e.g., tree-sitter-typescript has typescript and tsx).
 */
const GRAMMAR_EXPORTS: Record<ParserLanguage, string | undefined> = {
  typescript: undefined, // Uses default export
  javascript: undefined,
  python: undefined,
  go: undefined,
  rust: undefined,
  java: undefined,
};

/**
 * Singleton Grammar Manager for tree-sitter grammars.
 *
 * Handles:
 * - Checking if grammars are installed
 * - Installing grammars via Bun on demand
 * - Caching loaded grammars
 * - Thread-safe concurrent installation
 */
export class GrammarManager implements IGrammarManager {
  private static instance: GrammarManager | null = null;

  /** Cache of loaded grammars */
  private grammarCache: Map<ParserLanguage, unknown> = new Map();

  /** Track installation status */
  private installationStatus: Map<ParserLanguage, GrammarStatus> = new Map();

  /** Track pending installations to prevent duplicate installs */
  private pendingInstalls: Map<ParserLanguage, Promise<GrammarStatus>> =
    new Map();

  /** Optional logger for progress reporting */
  private logger?: Logger;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): GrammarManager {
    if (!GrammarManager.instance) {
      GrammarManager.instance = new GrammarManager();
    }
    return GrammarManager.instance;
  }

  /**
   * Set a logger for progress reporting.
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Check if a grammar package is installed.
   */
  async isInstalled(language: ParserLanguage): Promise<boolean> {
    // Check cache first
    if (this.grammarCache.has(language)) {
      return true;
    }

    const packageName = GRAMMAR_PACKAGES[language];
    if (!packageName) {
      return false;
    }

    try {
      // Try to require the package
      await import(packageName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install a grammar for a language using Bun.
   *
   * Thread-safe: concurrent calls for the same language will wait
   * for the first installation to complete.
   */
  async install(language: ParserLanguage): Promise<GrammarStatus> {
    const packageName = GRAMMAR_PACKAGES[language];

    if (!packageName) {
      const status: GrammarStatus = {
        language,
        installed: false,
        error: `Unknown language: ${language}`,
      };
      this.installationStatus.set(language, status);
      return status;
    }

    // Check if already installed
    if (await this.isInstalled(language)) {
      const status: GrammarStatus = {
        language,
        installed: true,
        packageName,
      };
      this.installationStatus.set(language, status);
      return status;
    }

    // Check if installation is already in progress
    const pending = this.pendingInstalls.get(language);
    if (pending) {
      return pending;
    }

    // Start installation
    const installPromise = this.doInstall(language, packageName);
    this.pendingInstalls.set(language, installPromise);

    try {
      const status = await installPromise;
      this.installationStatus.set(language, status);
      return status;
    } finally {
      this.pendingInstalls.delete(language);
    }
  }

  /**
   * Perform the actual installation using Bun.
   */
  private async doInstall(
    language: ParserLanguage,
    packageName: string
  ): Promise<GrammarStatus> {
    this.logger?.info?.(`Installing grammar: ${packageName}...`);

    try {
      // Use Bun.spawn to install the package
      const proc = Bun.spawn(["bun", "add", packageName], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.cwd(),
      });

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Installation failed: ${stderr}`);
      }

      // Verify installation
      await import(packageName);

      this.logger?.info?.(`Grammar installed: ${packageName}`);

      return {
        language,
        installed: true,
        packageName,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error?.(`Failed to install ${packageName}: ${message}`);

      return {
        language,
        installed: false,
        packageName,
        error: message,
      };
    }
  }

  /**
   * Get the status of all supported grammars.
   */
  async getStatus(): Promise<GrammarStatus[]> {
    const statuses: GrammarStatus[] = [];

    for (const language of Object.keys(GRAMMAR_PACKAGES) as ParserLanguage[]) {
      const installed = await this.isInstalled(language);
      statuses.push({
        language,
        installed,
        packageName: GRAMMAR_PACKAGES[language],
      });
    }

    return statuses;
  }

  /**
   * Pre-install grammars for a batch of languages.
   * Shows overall progress and handles failures gracefully.
   */
  async preInstallBatch(languages: ParserLanguage[]): Promise<GrammarStatus[]> {
    const uniqueLanguages = [...new Set(languages)];
    const results: GrammarStatus[] = [];

    // Check which languages need installation
    const toInstall: ParserLanguage[] = [];
    for (const lang of uniqueLanguages) {
      if (!(await this.isInstalled(lang))) {
        toInstall.push(lang);
      } else {
        results.push({
          language: lang,
          installed: true,
          packageName: GRAMMAR_PACKAGES[lang],
        });
      }
    }

    if (toInstall.length === 0) {
      return results;
    }

    this.logger?.info?.(
      `Installing ${toInstall.length} grammar(s): ${toInstall.join(", ")}...`
    );

    // Install in parallel with concurrency limit
    const CONCURRENCY = 3;
    for (let i = 0; i < toInstall.length; i += CONCURRENCY) {
      const batch = toInstall.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map((l) => this.install(l)));
      results.push(...batchResults);
    }

    // Log summary
    const successful = results.filter((r) => r.installed).length;
    const failed = results.filter((r) => !r.installed).length;

    if (failed > 0) {
      this.logger?.warn?.(
        `Grammar installation: ${successful} succeeded, ${failed} failed`
      );
    } else {
      this.logger?.info?.(`All ${successful} grammar(s) installed successfully`);
    }

    return results;
  }

  /**
   * Load a grammar module.
   * Returns the grammar if installed, null otherwise.
   */
  async loadGrammar(language: ParserLanguage): Promise<unknown | null> {
    // Check cache
    if (this.grammarCache.has(language)) {
      return this.grammarCache.get(language);
    }

    const packageName = GRAMMAR_PACKAGES[language];
    if (!packageName) {
      return null;
    }

    try {
      const grammar = await import(packageName);
      this.grammarCache.set(language, grammar);
      return grammar;
    } catch {
      return null;
    }
  }

  /**
   * Get the package name for a language.
   */
  getPackageName(language: ParserLanguage): string | undefined {
    return GRAMMAR_PACKAGES[language];
  }

  /**
   * Clear cached grammars (mainly for testing).
   */
  clearCache(): void {
    this.grammarCache.clear();
    this.installationStatus.clear();
  }
}

/**
 * Get the singleton grammar manager instance.
 */
export function getGrammarManager(): GrammarManager {
  return GrammarManager.getInstance();
}

