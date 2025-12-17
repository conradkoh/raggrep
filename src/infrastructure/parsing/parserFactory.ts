/**
 * Parser Factory
 *
 * Creates the appropriate parser for a given file or language.
 * Implements the strategy pattern for parser selection.
 *
 * Strategy:
 * - TypeScript/JavaScript: Use TypeScriptParser (TypeScript Compiler API)
 * - Python, Go, Rust, Java: Use TreeSitterParser
 * - Unknown: Fall back to TreeSitterParser or null
 */

import * as path from "path";
import type { IParser, ParserLanguage } from "../../domain/ports/parser";
import { TypeScriptParser } from "./typescriptParser";
import { TreeSitterParser } from "./treeSitterParser";

/**
 * Map from file extension to preferred parser type.
 */
const EXTENSION_PARSER_MAP: Record<string, "typescript" | "treesitter"> = {
  // TypeScript/JavaScript → TypeScript Compiler API (preferred)
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "typescript",
  ".jsx": "typescript",
  ".mjs": "typescript",
  ".cjs": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",

  // Other languages → tree-sitter
  ".py": "treesitter",
  ".pyw": "treesitter",
  ".go": "treesitter",
  ".rs": "treesitter",
  ".java": "treesitter",
};

/**
 * Map from language to preferred parser type.
 */
const LANGUAGE_PARSER_MAP: Record<ParserLanguage, "typescript" | "treesitter"> =
  {
    typescript: "typescript",
    javascript: "typescript",
    python: "treesitter",
    go: "treesitter",
    rust: "treesitter",
    java: "treesitter",
  };

// Singleton parser instances
let typescriptParserInstance: TypeScriptParser | null = null;
let treeSitterParserInstance: TreeSitterParser | null = null;

/**
 * Get or create the TypeScript parser singleton.
 */
function getTypeScriptParser(): TypeScriptParser {
  if (!typescriptParserInstance) {
    typescriptParserInstance = new TypeScriptParser();
  }
  return typescriptParserInstance;
}

/**
 * Get or create the tree-sitter parser singleton.
 */
function getTreeSitterParser(): TreeSitterParser {
  if (!treeSitterParserInstance) {
    treeSitterParserInstance = new TreeSitterParser();
  }
  return treeSitterParserInstance;
}

/**
 * Create a parser for the given file.
 *
 * @param filepath - The file path to get a parser for
 * @returns The appropriate parser, or null if no parser supports the file
 */
export function createParserForFile(filepath: string): IParser | null {
  const ext = path.extname(filepath).toLowerCase();
  const parserType = EXTENSION_PARSER_MAP[ext];

  if (!parserType) {
    return null;
  }

  if (parserType === "typescript") {
    return getTypeScriptParser();
  }

  return getTreeSitterParser();
}

/**
 * Create a parser for the given language.
 *
 * @param language - The language to get a parser for
 * @returns The appropriate parser
 */
export function createParserForLanguage(language: ParserLanguage): IParser {
  const parserType = LANGUAGE_PARSER_MAP[language];

  if (parserType === "typescript") {
    return getTypeScriptParser();
  }

  return getTreeSitterParser();
}

/**
 * Detect the language from a file path.
 *
 * @param filepath - The file path to detect language from
 * @returns The detected language, or null if unknown
 */
export function detectLanguage(filepath: string): ParserLanguage | null {
  const ext = path.extname(filepath).toLowerCase();

  const languageMap: Record<string, ParserLanguage> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".pyw": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
  };

  return languageMap[ext] || null;
}

/**
 * Detect languages from a list of file paths.
 * Returns unique languages found.
 *
 * @param filepaths - Array of file paths
 * @returns Set of detected languages
 */
export function detectLanguagesFromFiles(
  filepaths: string[]
): Set<ParserLanguage> {
  const languages = new Set<ParserLanguage>();

  for (const filepath of filepaths) {
    const lang = detectLanguage(filepath);
    if (lang) {
      languages.add(lang);
    }
  }

  return languages;
}

/**
 * Check if a file is supported by any parser.
 *
 * @param filepath - The file path to check
 * @returns True if a parser can handle this file
 */
export function isFileSupported(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return ext in EXTENSION_PARSER_MAP;
}

/**
 * Get all supported file extensions.
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_PARSER_MAP);
}

/**
 * Get all supported languages.
 */
export function getSupportedLanguages(): ParserLanguage[] {
  return Object.keys(LANGUAGE_PARSER_MAP) as ParserLanguage[];
}

