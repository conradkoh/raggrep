/**
 * Keyword Extraction Service
 * 
 * Pure domain service for extracting keywords from code.
 * No external dependencies - operates only on string data.
 */

/**
 * Common programming keywords to exclude from keyword extraction.
 * These appear in almost every code file and don't add search value.
 */
export const COMMON_KEYWORDS = new Set([
  // JavaScript/TypeScript
  'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
  'export', 'import', 'from', 'return', 'async', 'await', 'new', 'this',
  'true', 'false', 'null', 'undefined', 'if', 'else', 'for', 'while',
  'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally',
  'throw', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of',
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'object',
  'public', 'private', 'protected', 'static', 'readonly', 'abstract',
  'implements', 'extends', 'super', 'get', 'set', 'constructor',
  // Common words
  'the', 'and', 'for', 'not', 'with', 'are', 'was', 'has', 'have',
]);

/**
 * Extract keywords from code content and optional name.
 * 
 * @param content - Code content to extract keywords from
 * @param name - Optional name (function name, class name, etc.)
 * @param maxKeywords - Maximum keywords to return (default: 50)
 * @returns Array of unique lowercase keywords
 */
export function extractKeywords(
  content: string, 
  name?: string,
  maxKeywords: number = 50
): string[] {
  const keywords = new Set<string>();
  
  // Add the name if present
  if (name) {
    keywords.add(name.toLowerCase());
    
    // Also add camelCase parts (e.g., "getUserById" → ["get", "user", "by", "id"])
    const parts = name.split(/(?=[A-Z])/).map(p => p.toLowerCase());
    parts.forEach(p => p.length > 2 && keywords.add(p));
  }
  
  // Extract identifiers from content
  const identifierRegex = /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b/g;
  let match;
  
  while ((match = identifierRegex.exec(content)) !== null) {
    const word = match[1].toLowerCase();
    
    // Skip common keywords and very short words
    if (!COMMON_KEYWORDS.has(word) && word.length > 2) {
      keywords.add(word);
    }
  }
  
  return Array.from(keywords).slice(0, maxKeywords);
}

/**
 * Extract keywords from a file path.
 * 
 * @param filepath - File path to extract keywords from
 * @returns Array of keywords from path segments
 */
export function extractPathKeywords(filepath: string): string[] {
  return filepath
    .split(/[/\\.]/)
    .filter(p => p.length > 2 && !COMMON_KEYWORDS.has(p.toLowerCase()))
    .map(p => p.toLowerCase());
}

