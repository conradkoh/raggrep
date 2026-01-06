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

// ============================================================================
// Vocabulary Extraction
// ============================================================================

/**
 * Extract vocabulary words from a literal (identifier) name.
 *
 * Handles multiple naming conventions:
 * - camelCase: getUserById → ["get", "user", "by", "id"]
 * - PascalCase: AuthService → ["auth", "service"]
 * - snake_case: get_user_by_id → ["get", "user", "by", "id"]
 * - kebab-case: get-user-by-id → ["get", "user", "by", "id"]
 * - SCREAMING_SNAKE_CASE: MAX_RETRY_COUNT → ["max", "retry", "count"]
 *
 * @param literal - The identifier name to extract vocabulary from
 * @returns Array of unique vocabulary words (lowercase, length > 1)
 */
export function extractVocabulary(literal: string): string[] {
  if (!literal || literal.length === 0) {
    return [];
  }

  const words: string[] = [];

  // Handle snake_case and kebab-case first by splitting on delimiters
  const delimitedParts = literal.split(/[-_]/);

  for (const part of delimitedParts) {
    if (!part) continue;

    // Handle camelCase / PascalCase by splitting on uppercase letters
    // Keep sequences of uppercase letters together (e.g., "XMLParser" → "XML", "Parser")
    const camelSplit = part.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/);

    for (const word of camelSplit) {
      if (word) {
        words.push(word.toLowerCase());
      }
    }
  }

  // Filter out single characters and deduplicate
  const filtered = words.filter((w) => w.length > 1);
  return [...new Set(filtered)];
}

/**
 * Split a word by common abbreviations.
 * (Reserved for future use with known abbreviations)
 */
const COMMON_ABBREVIATIONS = new Set([
  "id",
  "api",
  "url",
  "uri",
  "db",
  "sql",
  "http",
  "https",
  "json",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "ui",
  "io",
  "os",
]);

/**
 * Check if a word is a common stop word that should be filtered.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "to",
  "of",
  "in",
  "for",
  "on",
  "at",
  "by",
  "or",
  "as",
  "if",
]);

/**
 * Extended stop words for query vocabulary extraction.
 * Includes question words and common query patterns.
 */
const QUERY_STOP_WORDS = new Set([
  ...STOP_WORDS,
  // Question words
  "what",
  "where",
  "when",
  "how",
  "why",
  "which",
  "who",
  // Query patterns
  "find",
  "show",
  "get",
  "list",
  "search",
  // Common connectors
  "and",
  "but",
  "with",
  "from",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  // Code-related generic words (too common)
  "code",
  "file",
  "function",
  "class",
  "method",
  "variable",
]);

/**
 * Extract vocabulary words from a natural language query.
 *
 * Unlike extractVocabulary (for identifiers), this:
 * 1. Tokenizes the query into words
 * 2. Filters out stop words
 * 3. Handles both natural language and embedded identifiers
 * 4. Returns unique, normalized vocabulary words
 *
 * @param query - The search query string
 * @returns Array of unique vocabulary words (lowercase, length > 1)
 *
 * @example
 * extractQueryVocabulary("where is user session validated")
 * // → ["user", "session", "validated"]
 *
 * extractQueryVocabulary("find the authenticateUser function")
 * // → ["authenticate", "user"] (identifier decomposed)
 */
export function extractQueryVocabulary(query: string): string[] {
  if (!query || query.trim() === "") {
    return [];
  }

  const vocabularySet = new Set<string>();

  // Tokenize query into words
  const tokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
    .split(/\s+/)
    .filter((t) => t.length > 1);

  for (const token of tokens) {
    // Skip stop words
    if (QUERY_STOP_WORDS.has(token)) {
      continue;
    }

    // Check if token looks like an identifier (has internal capitals or underscores)
    const looksLikeIdentifier =
      /[A-Z]/.test(token) || token.includes("_") || token.includes("-");

    if (looksLikeIdentifier) {
      // Decompose identifier into vocabulary words
      const vocabWords = extractVocabulary(token);
      for (const word of vocabWords) {
        if (!QUERY_STOP_WORDS.has(word)) {
          vocabularySet.add(word);
        }
      }
    } else {
      // Add as-is (already lowercase)
      vocabularySet.add(token);
    }
  }

  return Array.from(vocabularySet);
}

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
 * Also extracts vocabulary words from the literal for partial matching.
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
    const vocabulary = extractVocabulary(chunk.name);

    literals.push({
      value: chunk.name,
      type: literalType,
      matchType: "definition",
      vocabulary,
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
    const vocabulary = extractVocabulary(chunk.name);

    literals.push({
      value: chunk.name,
      type: literalType,
      matchType: "definition",
      vocabulary,
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
          vocabulary: extractVocabulary(name),
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
        vocabulary: extractVocabulary(match[1]),
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
        vocabulary: extractVocabulary(value),
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
