/**
 * Literal Extractor
 *
 * Extracts literals from code chunks for indexing.
 * For TypeScript/JavaScript, uses the chunk name from AST parsing.
 *
 * This is a pure domain service with no external dependencies.
 */

import type { Chunk } from "../entities/chunk";
import type { ExtractedLiteral, LiteralType } from "../entities/literal";

/**
 * Map from ChunkType to LiteralType for named chunks.
 */
const CHUNK_TYPE_TO_LITERAL_TYPE: Record<string, LiteralType> = {
  class: "className",
  function: "functionName",
  interface: "interfaceName",
  type: "typeName",
  enum: "enumName",
  variable: "variableName",
};

/**
 * Extract literals from a code chunk.
 *
 * For TypeScript/JavaScript chunks, this extracts the chunk's name
 * as a "definition" literal. The name comes from proper AST parsing,
 * so it's accurate and reliable.
 *
 * @param chunk - The code chunk to extract literals from
 * @returns Array of extracted literals (typically just the definition)
 */
export function extractLiterals(chunk: Chunk): ExtractedLiteral[] {
  const literals: ExtractedLiteral[] = [];

  // Extract the chunk's own name as a definition
  // This name comes from TypeScript AST parsing, so it's accurate
  if (chunk.name) {
    const literalType = CHUNK_TYPE_TO_LITERAL_TYPE[chunk.type] || "identifier";

    literals.push({
      value: chunk.name,
      type: literalType,
      matchType: "definition",
    });
  }

  return literals;
}

/**
 * Extract literals from a code chunk with additional reference extraction.
 *
 * This version also extracts references from the chunk content using
 * pattern matching. Use this for modules that want deeper literal indexing.
 *
 * @param chunk - The code chunk to extract literals from
 * @param options - Extraction options
 * @returns Array of extracted literals
 */
export function extractLiteralsWithReferences(
  chunk: Chunk,
  options: { includeImports?: boolean; includeTypeRefs?: boolean } = {}
): ExtractedLiteral[] {
  const literals: ExtractedLiteral[] = [];
  const seenValues = new Set<string>();

  // 1. Extract the chunk's own name as a definition
  if (chunk.name) {
    const literalType = CHUNK_TYPE_TO_LITERAL_TYPE[chunk.type] || "identifier";

    literals.push({
      value: chunk.name,
      type: literalType,
      matchType: "definition",
    });
    seenValues.add(chunk.name.toLowerCase());
  }

  // 2. Optionally extract imports
  if (options.includeImports) {
    const imports = extractImportLiterals(chunk.content);
    for (const lit of imports) {
      if (!seenValues.has(lit.value.toLowerCase())) {
        literals.push(lit);
        seenValues.add(lit.value.toLowerCase());
      }
    }
  }

  // 3. Optionally extract type references
  if (options.includeTypeRefs) {
    const refs = extractTypeReferences(chunk.content, chunk.name);
    for (const lit of refs) {
      if (!seenValues.has(lit.value.toLowerCase())) {
        literals.push(lit);
        seenValues.add(lit.value.toLowerCase());
      }
    }
  }

  return literals;
}

/**
 * Extract literals from import statements.
 * Only extracts PascalCase identifiers (likely classes/types).
 */
function extractImportLiterals(content: string): ExtractedLiteral[] {
  const literals: ExtractedLiteral[] = [];
  const seen = new Set<string>();

  // Named imports: import { Foo, Bar as Baz } from 'module'
  const namedImportPattern = /import\s*\{([^}]+)\}\s*from/g;
  let match: RegExpExecArray | null;

  while ((match = namedImportPattern.exec(content)) !== null) {
    const importList = match[1];
    const identifiers = importList.split(",").map((s) => s.trim());

    for (const id of identifiers) {
      const parts = id.split(/\s+as\s+/);
      const name = parts[0].trim();

      // Only extract PascalCase identifiers
      if (/^[A-Z][a-zA-Z0-9]*$/.test(name) && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        literals.push({
          value: name,
          type: "className",
          matchType: "import",
        });
      }
    }
  }

  // Default imports: import Foo from 'module'
  const defaultImportPattern = /import\s+([A-Z][a-zA-Z0-9]*)\s+from/g;
  while ((match = defaultImportPattern.exec(content)) !== null) {
    if (!seen.has(match[1].toLowerCase())) {
      seen.add(match[1].toLowerCase());
      literals.push({
        value: match[1],
        type: "className",
        matchType: "import",
      });
    }
  }

  return literals;
}

/**
 * Extract type reference literals (extends, implements).
 */
function extractTypeReferences(
  content: string,
  chunkName?: string
): ExtractedLiteral[] {
  const literals: ExtractedLiteral[] = [];
  const seen = new Set<string>();

  if (chunkName) {
    seen.add(chunkName.toLowerCase());
  }

  // Match: extends Foo, implements Bar
  const extendsPattern = /(?:extends|implements)\s+([A-Z][a-zA-Z0-9]*)/g;
  let match: RegExpExecArray | null;

  while ((match = extendsPattern.exec(content)) !== null) {
    const value = match[1];
    if (!seen.has(value.toLowerCase()) && !isBuiltInType(value)) {
      seen.add(value.toLowerCase());
      literals.push({
        value,
        type: "className",
        matchType: "reference",
      });
    }
  }

  return literals;
}

/**
 * Check if a type name is a built-in TypeScript type.
 */
function isBuiltInType(name: string): boolean {
  const builtIns = new Set([
    "String",
    "Number",
    "Boolean",
    "Object",
    "Array",
    "Function",
    "Symbol",
    "BigInt",
    "Promise",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Date",
    "RegExp",
    "Error",
    "Partial",
    "Required",
    "Readonly",
    "Record",
    "Pick",
    "Omit",
    "Exclude",
    "Extract",
    "NonNullable",
    "ReturnType",
    "InstanceType",
    "Parameters",
    "ConstructorParameters",
    "Awaited",
  ]);
  return builtIns.has(name);
}
