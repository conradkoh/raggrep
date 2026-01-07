/**
 * Tree-sitter Parser
 *
 * Uses web-tree-sitter (WebAssembly) for parsing multiple languages.
 * This parser supports Python, Go, Rust, Java, and can act as a fallback for TS/JS.
 *
 * Web-tree-sitter provides:
 * - Cross-platform compatibility (no native compilation)
 * - Fast, incremental parsing
 * - Support for many languages via WASM grammars
 * - Consistent AST structure
 */

import * as path from "path";
import * as fs from "fs";
import type {
  IParser,
  ParsedChunk,
  ParseResult,
  ParserConfig,
  ParserLanguage,
} from "../../domain/ports/parser";
import type { ChunkType } from "../../domain/entities/chunk";
import { getGrammarManager } from "./grammarManager";

/**
 * Map from file extension to parser language.
 */
const EXTENSION_TO_LANGUAGE: Record<string, ParserLanguage> = {
  ".py": "python",
  ".pyw": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  // TypeScript/JavaScript as fallback
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".mts": "typescript",
  ".cts": "typescript",
};

/**
 * Tree-sitter Parser implementation using web-tree-sitter (WebAssembly).
 *
 * Supports multiple languages through WASM grammar files.
 * Falls back to basic chunking if grammar is not available.
 */
export class TreeSitterParser implements IParser {
  readonly supportedLanguages: ParserLanguage[] = [
    "python",
    "go",
    "rust",
    "java",
    "typescript",
    "javascript",
  ];

  private grammarManager = getGrammarManager();
  private parserInstance: any = null;
  private loadedLanguages: Map<ParserLanguage, any> = new Map();
  private initPromise: Promise<void> | null = null;

  /**
   * Parse source code into semantic chunks using tree-sitter.
   */
  async parse(
    content: string,
    filepath: string,
    config?: ParserConfig
  ): Promise<ParseResult> {
    const language = this.detectLanguage(filepath);

    if (!language) {
      return {
        chunks: [],
        language: "typescript", // Default fallback
        success: false,
        error: `Unsupported file type: ${path.extname(filepath)}`,
      };
    }

    try {
      // Initialize tree-sitter if needed
      await this.ensureInitialized();

      // Check if grammar is available
      const langModule = await this.loadLanguage(language);

      if (!langModule) {
        // Fall back to basic line-based chunking
        return this.fallbackParse(content, filepath, language, config);
      }

      // Parse with tree-sitter
      const chunks = await this.parseWithTreeSitter(
        content,
        filepath,
        language,
        langModule,
        config
      );

      return {
        chunks,
        language,
        success: true,
      };
    } catch (error) {
      // Fall back to basic parsing on error
      return this.fallbackParse(content, filepath, language, config);
    }
  }

  /**
   * Check if this parser can handle the given file.
   */
  canParse(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return ext in EXTENSION_TO_LANGUAGE;
  }

  /**
   * Detect language from file extension.
   */
  private detectLanguage(filepath: string): ParserLanguage | null {
    const ext = path.extname(filepath).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] || null;
  }

  /**
   * Ensure tree-sitter is initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.parserInstance) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initializeTreeSitter();
    await this.initPromise;
  }

  /**
   * Initialize web-tree-sitter.
   */
  private async initializeTreeSitter(): Promise<void> {
    try {
      const { Parser } = await import("web-tree-sitter");

      // Locate the web-tree-sitter.wasm file relative to the web-tree-sitter package
      // This is needed because when installed globally or in different environments,
      // the default path resolution fails to find the WASM file
      const wasmPath = await this.resolveWasmPath();

      await Parser.init({
        locateFile: (scriptName: string) => {
          // Return the correct path to the WASM file
          if (scriptName.endsWith(".wasm")) {
            return wasmPath;
          }
          return scriptName;
        },
      });
      this.parserInstance = new Parser();
    } catch (error) {
      console.error("Failed to initialize web-tree-sitter:", error);
      throw error;
    }
  }

  /**
   * Resolve the path to the web-tree-sitter.wasm file.
   * Tries multiple strategies to find the file.
   */
  private async resolveWasmPath(): Promise<string> {
    // Strategy 1: Try to find it via require.resolve (works in Node.js/Bun)
    try {
      const webTreeSitterPath = require.resolve("web-tree-sitter");
      const wasmPath = path.join(
        path.dirname(webTreeSitterPath),
        "web-tree-sitter.wasm"
      );
      if (fs.existsSync(wasmPath)) {
        return wasmPath;
      }
    } catch {
      // require.resolve not available or failed
    }

    // Strategy 2: Try relative to __dirname (for bundled scenarios)
    try {
      const possiblePaths = [
        // Relative to this file in node_modules
        path.join(__dirname, "../../../node_modules/web-tree-sitter/web-tree-sitter.wasm"),
        // Relative to dist folder
        path.join(__dirname, "../../node_modules/web-tree-sitter/web-tree-sitter.wasm"),
        // Relative to package root
        path.join(__dirname, "../../../../node_modules/web-tree-sitter/web-tree-sitter.wasm"),
        // In the same directory (if copied during build)
        path.join(__dirname, "web-tree-sitter.wasm"),
      ];

      for (const wasmPath of possiblePaths) {
        if (fs.existsSync(wasmPath)) {
          return wasmPath;
        }
      }
    } catch {
      // __dirname not available
    }

    // Strategy 3: Return the default name and let Emscripten try to find it
    // This might work in browser environments
    return "web-tree-sitter.wasm";
  }

  /**
   * Load a language module for tree-sitter.
   * Returns null if the language is not available.
   */
  private async loadLanguage(language: ParserLanguage): Promise<any> {
    // Check cache
    if (this.loadedLanguages.has(language)) {
      return this.loadedLanguages.get(language);
    }

    // For now, we'll skip WASM loading and return null
    // This means we'll use the fallback parser
    // TODO: Download and cache WASM files in a future iteration
    return null;
  }

  /**
   * Parse source code with tree-sitter.
   */
  private async parseWithTreeSitter(
    content: string,
    filepath: string,
    language: ParserLanguage,
    langModule: any,
    config?: ParserConfig
  ): Promise<ParsedChunk[]> {
    // Set the language
    this.parserInstance.setLanguage(langModule);

    // Parse the content
    const tree = this.parserInstance.parse(content);
    const chunks: ParsedChunk[] = [];

    // Extract chunks based on language
    switch (language) {
      case "python":
        this.extractPythonChunks(tree.rootNode, content, chunks, config);
        break;
      case "go":
        this.extractGoChunks(tree.rootNode, content, chunks, config);
        break;
      case "rust":
        this.extractRustChunks(tree.rootNode, content, chunks, config);
        break;
      case "java":
        this.extractJavaChunks(tree.rootNode, content, chunks, config);
        break;
      default:
        this.extractGenericChunks(tree.rootNode, content, chunks, config);
    }

    // Add full file chunk if requested
    if (config?.includeFullFileChunk) {
      const lines = content.split("\n");
      chunks.unshift({
        content,
        startLine: 1,
        endLine: lines.length,
        type: "file",
        name: path.basename(filepath),
        isExported: false,
      });
    }

    return chunks;
  }

  /**
   * Extract chunks from Python AST.
   */
  private extractPythonChunks(
    rootNode: any,
    content: string,
    chunks: ParsedChunk[],
    config?: ParserConfig
  ): void {
    const lines = content.split("\n");

    const visit = (node: any): void => {
      const nodeType = node.type;

      // Function definitions
      if (nodeType === "function_definition") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "function",
          config
        );
        if (chunk) {
          // Extract docstring
          const body = node.childForFieldName("body");
          if (body && body.firstChild?.type === "expression_statement") {
            const expr = body.firstChild.firstChild;
            if (expr?.type === "string") {
              chunk.docComment = this.getNodeText(expr, content);
            }
          }
          chunks.push(chunk);
        }
        return;
      }

      // Class definitions
      if (nodeType === "class_definition") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "class",
          config
        );
        if (chunk) {
          const body = node.childForFieldName("body");
          if (body && body.firstChild?.type === "expression_statement") {
            const expr = body.firstChild.firstChild;
            if (expr?.type === "string") {
              chunk.docComment = this.getNodeText(expr, content);
            }
          }
          chunks.push(chunk);
        }
        return;
      }

      // Recurse into children
      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i));
      }
    };

    visit(rootNode);
  }

  /**
   * Extract chunks from Go AST.
   */
  private extractGoChunks(
    rootNode: any,
    content: string,
    chunks: ParsedChunk[],
    config?: ParserConfig
  ): void {
    const lines = content.split("\n");

    const visit = (node: any): void => {
      const nodeType = node.type;

      // Function declarations
      if (
        nodeType === "function_declaration" ||
        nodeType === "method_declaration"
      ) {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "function",
          config
        );
        if (chunk) {
          const comment = this.findPrecedingComment(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      // Type declarations
      if (nodeType === "type_declaration") {
        const spec = node.namedChild(0);
        if (spec) {
          const specType = spec.childForFieldName("type");
          const chunkType: ChunkType =
            specType?.type === "interface_type" ? "interface" : "type";
          const chunk = this.createChunkFromNode(
            node,
            content,
            lines,
            chunkType,
            config
          );
          if (chunk) {
            const comment = this.findPrecedingComment(node, content, lines);
            if (comment) {
              chunk.docComment = comment;
            }
            chunks.push(chunk);
          }
        }
        return;
      }

      // Recurse into children
      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i));
      }
    };

    visit(rootNode);
  }

  /**
   * Extract chunks from Rust AST.
   */
  private extractRustChunks(
    rootNode: any,
    content: string,
    chunks: ParsedChunk[],
    config?: ParserConfig
  ): void {
    const lines = content.split("\n");

    const visit = (node: any): void => {
      const nodeType = node.type;

      if (nodeType === "function_item") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "function",
          config
        );
        if (chunk) {
          const vis = node.childForFieldName("visibility");
          if (vis) {
            chunk.isExported = true;
          }
          const comment = this.findRustDocComment(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      if (nodeType === "struct_item") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "class",
          config
        );
        if (chunk) {
          const vis = node.childForFieldName("visibility");
          if (vis) {
            chunk.isExported = true;
          }
          const comment = this.findRustDocComment(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      if (nodeType === "trait_item") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "interface",
          config
        );
        if (chunk) {
          const vis = node.childForFieldName("visibility");
          if (vis) {
            chunk.isExported = true;
          }
          const comment = this.findRustDocComment(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      if (nodeType === "impl_item") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "class",
          config
        );
        if (chunk) {
          chunks.push(chunk);
        }
        return;
      }

      if (nodeType === "enum_item") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "enum",
          config
        );
        if (chunk) {
          const vis = node.childForFieldName("visibility");
          if (vis) {
            chunk.isExported = true;
          }
          const comment = this.findRustDocComment(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i));
      }
    };

    visit(rootNode);
  }

  /**
   * Extract chunks from Java AST.
   */
  private extractJavaChunks(
    rootNode: any,
    content: string,
    chunks: ParsedChunk[],
    config?: ParserConfig
  ): void {
    const lines = content.split("\n");

    const visit = (node: any): void => {
      const nodeType = node.type;

      if (nodeType === "method_declaration") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "function",
          config
        );
        if (chunk) {
          const modifiers = node.childForFieldName("modifiers");
          if (modifiers) {
            chunk.isExported = this.getNodeText(modifiers, content).includes(
              "public"
            );
          }
          const comment = this.findJavadoc(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      if (nodeType === "class_declaration") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "class",
          config
        );
        if (chunk) {
          const modifiers = node.childForFieldName("modifiers");
          if (modifiers) {
            chunk.isExported = this.getNodeText(modifiers, content).includes(
              "public"
            );
          }
          const comment = this.findJavadoc(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      if (nodeType === "interface_declaration") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "interface",
          config
        );
        if (chunk) {
          const modifiers = node.childForFieldName("modifiers");
          if (modifiers) {
            chunk.isExported = this.getNodeText(modifiers, content).includes(
              "public"
            );
          }
          const comment = this.findJavadoc(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      if (nodeType === "enum_declaration") {
        const chunk = this.createChunkFromNode(
          node,
          content,
          lines,
          "enum",
          config
        );
        if (chunk) {
          const modifiers = node.childForFieldName("modifiers");
          if (modifiers) {
            chunk.isExported = this.getNodeText(modifiers, content).includes(
              "public"
            );
          }
          const comment = this.findJavadoc(node, content, lines);
          if (comment) {
            chunk.docComment = comment;
          }
          chunks.push(chunk);
        }
        return;
      }

      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i));
      }
    };

    visit(rootNode);
  }

  /**
   * Extract generic chunks.
   */
  private extractGenericChunks(
    rootNode: any,
    content: string,
    chunks: ParsedChunk[],
    config?: ParserConfig
  ): void {
    const lines = content.split("\n");
    chunks.push({
      content,
      startLine: 1,
      endLine: lines.length,
      type: "file",
    });
  }

  /**
   * Create a chunk from a tree-sitter node.
   */
  private createChunkFromNode(
    node: any,
    content: string,
    lines: string[],
    type: ChunkType,
    config?: ParserConfig
  ): ParsedChunk | null {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    const nodeContent = this.getNodeText(node, content);
    if (!nodeContent.trim()) return null;

    let name: string | undefined;
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      name = this.getNodeText(nameNode, content);
    }

    return {
      content: nodeContent,
      startLine,
      endLine,
      type,
      name,
    };
  }

  /**
   * Get the text content of a tree-sitter node.
   */
  private getNodeText(node: any, content: string): string {
    return content.slice(node.startIndex, node.endIndex);
  }

  /**
   * Find a preceding comment (for Go-style comments).
   */
  private findPrecedingComment(
    node: any,
    content: string,
    lines: string[]
  ): string | undefined {
    const startLine = node.startPosition.row;
    if (startLine === 0) return undefined;

    const comments: string[] = [];
    for (let i = startLine - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("//")) {
        comments.unshift(line.slice(2).trim());
      } else if (line === "") {
        if (i < startLine - 1) break;
      } else {
        break;
      }
    }

    return comments.length > 0 ? comments.join("\n") : undefined;
  }

  /**
   * Find Rust doc comments (/// or //!).
   */
  private findRustDocComment(
    node: any,
    content: string,
    lines: string[]
  ): string | undefined {
    const startLine = node.startPosition.row;
    if (startLine === 0) return undefined;

    const comments: string[] = [];
    for (let i = startLine - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("///") || line.startsWith("//!")) {
        comments.unshift(line.slice(3).trim());
      } else if (line === "") {
        if (i < startLine - 1) break;
      } else {
        break;
      }
    }

    return comments.length > 0 ? comments.join("\n") : undefined;
  }

  /**
   * Find Javadoc comments.
   */
  private findJavadoc(
    node: any,
    content: string,
    lines: string[]
  ): string | undefined {
    const startLine = node.startPosition.row;
    if (startLine === 0) return undefined;

    let inJavadoc = false;
    const comments: string[] = [];

    for (let i = startLine - 1; i >= 0; i--) {
      const line = lines[i].trim();

      if (line.endsWith("*/")) {
        inJavadoc = true;
        const content = line.slice(0, -2).replace(/^\*\s*/, "").trim();
        if (content && content !== "/**") {
          comments.unshift(content);
        }
      } else if (inJavadoc) {
        if (line.startsWith("/**")) {
          const content = line.slice(3).replace(/\*\s*$/, "").trim();
          if (content) {
            comments.unshift(content);
          }
          break;
        } else if (line.startsWith("*")) {
          const content = line.slice(1).trim();
          if (content) {
            comments.unshift(content);
          }
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return comments.length > 0 ? comments.join("\n") : undefined;
  }

  /**
   * Fall back to basic line-based parsing.
   */
  private fallbackParse(
    content: string,
    filepath: string,
    language: ParserLanguage,
    config?: ParserConfig
  ): ParseResult {
    const lines = content.split("\n");
    const chunks: ParsedChunk[] = [];

    chunks.push({
      content,
      startLine: 1,
      endLine: lines.length,
      type: "file",
      name: path.basename(filepath),
    });

    return {
      chunks,
      language,
      success: true,
    };
  }
}

/**
 * Create a new tree-sitter parser instance.
 */
export function createTreeSitterParser(): TreeSitterParser {
  return new TreeSitterParser();
}
