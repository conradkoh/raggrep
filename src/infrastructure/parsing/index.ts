/**
 * Parsing Infrastructure
 *
 * Provides parser implementations for different programming languages.
 *
 * Exports:
 * - TypeScriptParser: Uses TypeScript Compiler API for TS/JS
 * - TreeSitterParser: Uses tree-sitter for Python, Go, Rust, Java
 * - GrammarManager: Manages tree-sitter grammar installation
 * - Parser factory functions for automatic parser selection
 */

// Parser implementations
export { TypeScriptParser, createTypeScriptParser } from "./typescriptParser";
export { TreeSitterParser, createTreeSitterParser } from "./treeSitterParser";

// Grammar management
export { GrammarManager, getGrammarManager } from "./grammarManager";

// Parser factory
export {
  createParserForFile,
  createParserForLanguage,
  detectLanguage,
  detectLanguagesFromFiles,
  isFileSupported,
  getSupportedExtensions,
  getSupportedLanguages,
} from "./parserFactory";

