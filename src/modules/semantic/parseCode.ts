/**
 * TypeScript/JavaScript Code Parser
 * 
 * Uses the TypeScript Compiler API for accurate AST-based parsing.
 * Extracts semantic chunks: functions, classes, interfaces, types, enums.
 */

import * as ts from 'typescript';

/**
 * Chunk types that can be extracted from code
 */
export type ChunkType = 
  | 'function' 
  | 'class' 
  | 'interface' 
  | 'type' 
  | 'enum'
  | 'variable'
  | 'block' 
  | 'file';

/**
 * Represents a parsed chunk of code with location information
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
  /** JSDoc comment if present */
  jsDoc?: string;
}

/**
 * Parse code into semantic chunks based on file extension
 * @param content - The source code content
 * @param filepath - The file path (used to determine language)
 * @returns Array of parsed chunks
 */
export function parseCode(content: string, filepath: string): ParsedChunk[] {
  const ext = filepath.split('.').pop()?.toLowerCase();

  // For TypeScript/JavaScript files, use the TypeScript parser
  if (['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs'].includes(ext || '')) {
    return parseTypeScript(content, filepath);
  }

  // For other files, use simple line-based chunking
  return parseGenericCode(content);
}

/**
 * Parse TypeScript/JavaScript code using the TypeScript Compiler API
 * @param content - The source code content
 * @param filepath - The file path
 * @returns Array of parsed chunks
 */
function parseTypeScript(content: string, filepath: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  const lines = content.split('\n');

  // Create a source file from the content
  const sourceFile = ts.createSourceFile(
    filepath,
    content,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    filepath.endsWith('.tsx') || filepath.endsWith('.jsx') 
      ? ts.ScriptKind.TSX 
      : ts.ScriptKind.TS
  );

  /**
   * Get line numbers for a node (1-based)
   */
  function getLineNumbers(node: ts.Node): { startLine: number; endLine: number } {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      startLine: start.line + 1,
      endLine: end.line + 1,
    };
  }

  /**
   * Get the source text for a node
   */
  function getNodeText(node: ts.Node): string {
    return node.getText(sourceFile);
  }

  /**
   * Check if a node has export modifier
   */
  function isExported(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  /**
   * Get JSDoc comment for a node
   */
  function getJSDoc(node: ts.Node): string | undefined {
    const jsDocNodes = ts.getJSDocCommentsAndTags(node);
    if (jsDocNodes.length === 0) return undefined;
    
    return jsDocNodes
      .map(doc => doc.getText(sourceFile))
      .join('\n');
  }

  /**
   * Get function name from various function declarations
   */
  function getFunctionName(node: ts.Node): string | undefined {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    return undefined;
  }

  /**
   * Visit nodes recursively to extract chunks
   */
  function visit(node: ts.Node): void {
    const { startLine, endLine } = getLineNumbers(node);

    // Function declarations (including async)
    if (ts.isFunctionDeclaration(node) && node.name) {
      chunks.push({
        content: getNodeText(node),
        startLine,
        endLine,
        type: 'function',
        name: node.name.text,
        isExported: isExported(node),
        jsDoc: getJSDoc(node),
      });
      return; // Don't recurse into function body
    }

    // Arrow functions and function expressions assigned to variables
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && 
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          const name = ts.isIdentifier(decl.name) ? decl.name.text : undefined;
          chunks.push({
            content: getNodeText(node),
            startLine,
            endLine,
            type: 'function',
            name,
            isExported: isExported(node),
            jsDoc: getJSDoc(node),
          });
          return;
        }
      }
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      chunks.push({
        content: getNodeText(node),
        startLine,
        endLine,
        type: 'class',
        name: node.name.text,
        isExported: isExported(node),
        jsDoc: getJSDoc(node),
      });
      return; // Don't recurse into class body (it's included in the chunk)
    }

    // Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      chunks.push({
        content: getNodeText(node),
        startLine,
        endLine,
        type: 'interface',
        name: node.name.text,
        isExported: isExported(node),
        jsDoc: getJSDoc(node),
      });
      return;
    }

    // Type alias declarations
    if (ts.isTypeAliasDeclaration(node)) {
      chunks.push({
        content: getNodeText(node),
        startLine,
        endLine,
        type: 'type',
        name: node.name.text,
        isExported: isExported(node),
        jsDoc: getJSDoc(node),
      });
      return;
    }

    // Enum declarations
    if (ts.isEnumDeclaration(node)) {
      chunks.push({
        content: getNodeText(node),
        startLine,
        endLine,
        type: 'enum',
        name: node.name.text,
        isExported: isExported(node),
        jsDoc: getJSDoc(node),
      });
      return;
    }

    // Exported variable declarations (constants)
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const decl of node.declarationList.declarations) {
        // Skip if it's a function (already handled above)
        if (decl.initializer && 
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          continue;
        }
        const name = ts.isIdentifier(decl.name) ? decl.name.text : undefined;
        chunks.push({
          content: getNodeText(node),
          startLine,
          endLine,
          type: 'variable',
          name,
          isExported: true,
          jsDoc: getJSDoc(node),
        });
      }
      return;
    }

    // Recurse into children
    ts.forEachChild(node, visit);
  }

  // Start visiting from the root
  ts.forEachChild(sourceFile, visit);

  // If no semantic chunks found, fall back to block-based chunking
  if (chunks.length === 0) {
    return parseGenericCode(content);
  }

  return chunks;
}

/**
 * Parse generic code using line-based chunking
 * Used for non-TypeScript/JavaScript files or as fallback
 * @param content - The source code content
 * @returns Array of parsed chunks
 */
function parseGenericCode(content: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  const lines = content.split('\n');
  const CHUNK_SIZE = 30; // lines per chunk
  const OVERLAP = 5; // overlap between chunks

  // If file is small, treat as single chunk
  if (lines.length <= CHUNK_SIZE) {
    return [
      {
        content: content,
        startLine: 1,
        endLine: lines.length,
        type: 'file',
      },
    ];
  }

  // Split into overlapping chunks
  for (let i = 0; i < lines.length; i += CHUNK_SIZE - OVERLAP) {
    const endIdx = Math.min(i + CHUNK_SIZE, lines.length);
    chunks.push({
      content: lines.slice(i, endIdx).join('\n'),
      startLine: i + 1,
      endLine: endIdx,
      type: 'block',
    });

    if (endIdx >= lines.length) break;
  }

  return chunks;
}

/**
 * Generate a unique chunk ID from filepath and line numbers
 * @param filepath - The source file path
 * @param startLine - Start line number
 * @param endLine - End line number
 * @returns Unique chunk identifier
 */
export function generateChunkId(filepath: string, startLine: number, endLine: number): string {
  const safePath = filepath.replace(/[/\\]/g, '-').replace(/\./g, '_');
  return `${safePath}-${startLine}-${endLine}`;
}
