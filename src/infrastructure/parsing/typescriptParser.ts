/**
 * TypeScript Parser
 *
 * Wraps the existing TypeScript Compiler API-based parser in the IParser interface.
 * This provides superior type information and JSDoc parsing for TS/JS files.
 *
 * For TypeScript and JavaScript files, this parser is preferred over tree-sitter
 * because it has access to full type information and proven quality.
 */

import * as path from "path";
import type {
  IParser,
  ParsedChunk,
  ParseResult,
  ParserConfig,
  ParserLanguage,
} from "../../domain/ports/parser";
import {
  parseTypeScriptCode,
  type ParsedChunk as TSParsedChunk,
} from "../../modules/language/typescript/parseCode";

/**
 * File extensions supported by the TypeScript parser.
 */
const TYPESCRIPT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
];

/**
 * TypeScript Parser implementation using TypeScript Compiler API.
 *
 * This is the primary parser for TypeScript and JavaScript files.
 * It provides:
 * - Accurate AST parsing
 * - Full JSDoc extraction
 * - Export detection
 * - Type information
 */
export class TypeScriptParser implements IParser {
  readonly supportedLanguages: ParserLanguage[] = ["typescript", "javascript"];

  /**
   * Parse TypeScript/JavaScript source code into semantic chunks.
   */
  async parse(
    content: string,
    filepath: string,
    config?: ParserConfig
  ): Promise<ParseResult> {
    try {
      // Use the existing TypeScript parser
      const tsChunks = parseTypeScriptCode(content, filepath);

      // Convert to ParsedChunk format
      const chunks: ParsedChunk[] = tsChunks.map((tc) =>
        this.convertChunk(tc)
      );

      // Optionally add full file chunk
      if (config?.includeFullFileChunk) {
        const lines = content.split("\n");
        const fullFileChunk: ParsedChunk = {
          content,
          startLine: 1,
          endLine: lines.length,
          type: "file",
          name: path.basename(filepath),
          isExported: false,
        };

        // Add full file chunk at the beginning
        chunks.unshift(fullFileChunk);
      }

      // Detect language from extension
      const ext = path.extname(filepath).toLowerCase();
      const language: ParserLanguage =
        ext === ".js" ||
        ext === ".jsx" ||
        ext === ".mjs" ||
        ext === ".cjs"
          ? "javascript"
          : "typescript";

      return {
        chunks,
        language,
        success: true,
      };
    } catch (error) {
      return {
        chunks: [],
        language: this.detectLanguage(filepath),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if this parser can handle the given file.
   */
  canParse(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return TYPESCRIPT_EXTENSIONS.includes(ext);
  }

  /**
   * Convert from the existing ParsedChunk format to the domain ParsedChunk format.
   */
  private convertChunk(tc: TSParsedChunk): ParsedChunk {
    return {
      content: tc.content,
      startLine: tc.startLine,
      endLine: tc.endLine,
      type: tc.type,
      name: tc.name,
      isExported: tc.isExported,
      docComment: tc.jsDoc,
    };
  }

  /**
   * Detect language from file extension.
   */
  private detectLanguage(filepath: string): ParserLanguage {
    const ext = path.extname(filepath).toLowerCase();
    if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
      return "javascript";
    }
    return "typescript";
  }
}

/**
 * Create a new TypeScript parser instance.
 */
export function createTypeScriptParser(): TypeScriptParser {
  return new TypeScriptParser();
}

