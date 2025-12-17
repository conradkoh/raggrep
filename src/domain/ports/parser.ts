/**
 * Parser Port
 *
 * Defines the interface for code parsers that can extract semantic chunks from source files.
 * This abstraction allows for different parsing implementations (TypeScript API, tree-sitter)
 * while keeping the domain layer independent of specific parsing technologies.
 */

import type { ChunkType } from "../entities/chunk";

/**
 * A parsed chunk of code with location and metadata.
 * This is the output of any parser implementation.
 */
export interface ParsedChunk {
  /** The source code content */
  content: string;

  /** 1-based start line number */
  startLine: number;

  /** 1-based end line number */
  endLine: number;

  /** The type of code construct */
  type: ChunkType;

  /** Name of the construct (function name, class name, etc.) */
  name?: string;

  /** Whether this is exported */
  isExported?: boolean;

  /** Documentation comment if present (JSDoc, docstring, etc.) */
  docComment?: string;

  /** Line comments associated with this chunk */
  comments?: string[];
}

/**
 * Supported languages for parsing.
 */
export type ParserLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java";

/**
 * Parser configuration options.
 */
export interface ParserConfig {
  /** Include full file chunk in output */
  includeFullFileChunk?: boolean;

  /** Associate comments with code chunks */
  associateComments?: boolean;

  /** Language-specific options */
  languageOptions?: Record<string, unknown>;
}

/**
 * Result of parsing a file.
 */
export interface ParseResult {
  /** Parsed chunks */
  chunks: ParsedChunk[];

  /** Language detected/used */
  language: ParserLanguage;

  /** Whether parsing succeeded */
  success: boolean;

  /** Error message if parsing failed */
  error?: string;
}

/**
 * Parser interface for extracting semantic chunks from source code.
 *
 * Implementations:
 * - TypeScriptParser: Uses TypeScript Compiler API for TS/JS files
 * - TreeSitterParser: Uses tree-sitter for Python, Go, Rust, etc.
 */
export interface IParser {
  /**
   * Languages this parser supports.
   */
  readonly supportedLanguages: ParserLanguage[];

  /**
   * Parse source code into semantic chunks.
   *
   * @param content - The source code content
   * @param filepath - The file path (used for language detection and context)
   * @param config - Optional parser configuration
   * @returns Parse result with chunks or error
   */
  parse(
    content: string,
    filepath: string,
    config?: ParserConfig
  ): Promise<ParseResult>;

  /**
   * Check if the parser can handle a specific file.
   *
   * @param filepath - The file path to check
   * @returns True if the parser can handle this file
   */
  canParse(filepath: string): boolean;
}

/**
 * Grammar status for dynamic installation.
 */
export interface GrammarStatus {
  /** Language identifier */
  language: ParserLanguage;

  /** Whether the grammar is installed */
  installed: boolean;

  /** Grammar package name if installed */
  packageName?: string;

  /** Error message if installation failed */
  error?: string;
}

/**
 * Grammar manager interface for dynamic grammar installation.
 */
export interface IGrammarManager {
  /**
   * Check if a grammar is installed.
   */
  isInstalled(language: ParserLanguage): Promise<boolean>;

  /**
   * Install a grammar for a language.
   */
  install(language: ParserLanguage): Promise<GrammarStatus>;

  /**
   * Get status of all grammars.
   */
  getStatus(): Promise<GrammarStatus[]>;

  /**
   * Pre-install grammars for a batch of languages.
   */
  preInstallBatch(languages: ParserLanguage[]): Promise<GrammarStatus[]>;
}

