/**
 * Regex-based Symbol Extraction
 *
 * Extracts symbols from code using regular expressions.
 * Language-agnostic but optimized for common patterns.
 */

export type SymbolType =
  | "function"
  | "class"
  | "variable"
  | "interface"
  | "type"
  | "enum"
  | "method"
  | "other";

export interface ExtractedSymbol {
  name: string;
  type: SymbolType;
  line: number;
  isExported: boolean;
}

/**
 * Patterns for extracting symbols from code.
 * Order matters - more specific patterns should come first.
 */
const SYMBOL_PATTERNS: Array<{
  type: SymbolType;
  pattern: RegExp;
  exported: boolean;
}> = [
  // Exported function declarations
  {
    type: "function",
    pattern: /^export\s+(?:async\s+)?function\s+(\w+)/gm,
    exported: true,
  },
  // Exported arrow functions
  {
    type: "function",
    pattern: /^export\s+(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
    exported: true,
  },
  // Exported classes
  {
    type: "class",
    pattern: /^export\s+(?:abstract\s+)?class\s+(\w+)/gm,
    exported: true,
  },
  // Exported interfaces (TypeScript)
  {
    type: "interface",
    pattern: /^export\s+interface\s+(\w+)/gm,
    exported: true,
  },
  // Exported types (TypeScript)
  {
    type: "type",
    pattern: /^export\s+type\s+(\w+)/gm,
    exported: true,
  },
  // Exported enums
  {
    type: "enum",
    pattern: /^export\s+(?:const\s+)?enum\s+(\w+)/gm,
    exported: true,
  },
  // Exported variables
  {
    type: "variable",
    pattern: /^export\s+(?:const|let|var)\s+(\w+)\s*(?::|=)/gm,
    exported: true,
  },
  // Default exports
  {
    type: "function",
    pattern: /^export\s+default\s+(?:async\s+)?function\s+(\w+)/gm,
    exported: true,
  },
  {
    type: "class",
    pattern: /^export\s+default\s+class\s+(\w+)/gm,
    exported: true,
  },

  // Non-exported declarations
  {
    type: "function",
    pattern: /^(?:async\s+)?function\s+(\w+)/gm,
    exported: false,
  },
  {
    type: "function",
    pattern: /^(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
    exported: false,
  },
  {
    type: "class",
    pattern: /^(?:abstract\s+)?class\s+(\w+)/gm,
    exported: false,
  },
  {
    type: "interface",
    pattern: /^interface\s+(\w+)/gm,
    exported: false,
  },
  {
    type: "type",
    pattern: /^type\s+(\w+)/gm,
    exported: false,
  },
  {
    type: "enum",
    pattern: /^(?:const\s+)?enum\s+(\w+)/gm,
    exported: false,
  },

  // Python patterns
  {
    type: "function",
    pattern: /^def\s+(\w+)\s*\(/gm,
    exported: false,
  },
  {
    type: "class",
    pattern: /^class\s+(\w+)(?:\s*\(|:)/gm,
    exported: false,
  },

  // Go patterns
  {
    type: "function",
    pattern: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm,
    exported: false,
  },
  {
    type: "type",
    pattern: /^type\s+(\w+)\s+(?:struct|interface)/gm,
    exported: false,
  },

  // Rust patterns
  {
    type: "function",
    pattern: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm,
    exported: false,
  },
  {
    type: "type",
    pattern: /^(?:pub\s+)?struct\s+(\w+)/gm,
    exported: false,
  },
  {
    type: "enum",
    pattern: /^(?:pub\s+)?enum\s+(\w+)/gm,
    exported: false,
  },
  {
    type: "interface",
    pattern: /^(?:pub\s+)?trait\s+(\w+)/gm,
    exported: false,
  },
];

/**
 * Extract symbols from code content using regex patterns.
 *
 * @param content - The source code content
 * @returns Array of extracted symbols with their locations
 */
export function extractSymbols(content: string): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const seenSymbols = new Set<string>(); // Track seen symbols to avoid duplicates

  // Split content into lines for line number calculation
  const lines = content.split("\n");

  for (const { type, pattern, exported } of SYMBOL_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const symbolKey = `${name}:${type}`;

      // Skip if we've already seen this symbol (from a more specific pattern)
      if (seenSymbols.has(symbolKey)) continue;
      seenSymbols.add(symbolKey);

      // Calculate line number
      const beforeMatch = content.substring(0, match.index);
      const line = beforeMatch.split("\n").length;

      symbols.push({
        name,
        type,
        line,
        isExported: exported,
      });
    }
  }

  // Sort by line number
  return symbols.sort((a, b) => a.line - b.line);
}

/**
 * Extract symbol names as keywords for BM25 indexing.
 *
 * @param symbols - Array of extracted symbols
 * @returns Array of unique symbol names
 */
export function symbolsToKeywords(symbols: ExtractedSymbol[]): string[] {
  const keywords = new Set<string>();

  for (const symbol of symbols) {
    // Add the full name
    keywords.add(symbol.name.toLowerCase());

    // Split camelCase/PascalCase into parts
    const parts = symbol.name
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .toLowerCase()
      .split(/\s+/);

    for (const part of parts) {
      if (part.length > 2) {
        keywords.add(part);
      }
    }
  }

  return Array.from(keywords);
}

