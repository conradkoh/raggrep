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
 * Common architectural layer patterns in file names/paths.
 * Used to detect the layer a file belongs to.
 */
export const LAYER_PATTERNS: Record<string, string[]> = {
  'controller': ['controller', 'controllers', 'handler', 'handlers', 'route', 'routes', 'api'],
  'service': ['service', 'services', 'usecase', 'usecases', 'application'],
  'repository': ['repository', 'repositories', 'repo', 'repos', 'dao', 'store', 'storage'],
  'model': ['model', 'models', 'entity', 'entities', 'schema', 'schemas'],
  'util': ['util', 'utils', 'utility', 'utilities', 'helper', 'helpers', 'common', 'shared'],
  'config': ['config', 'configs', 'configuration', 'settings'],
  'middleware': ['middleware', 'middlewares', 'interceptor', 'interceptors'],
  'domain': ['domain', 'core', 'business'],
  'infrastructure': ['infrastructure', 'infra', 'external', 'adapters'],
  'presentation': ['presentation', 'view', 'views', 'component', 'components', 'ui'],
  'test': ['test', 'tests', 'spec', 'specs', '__tests__', '__test__'],
};

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
 * Split a string by camelCase, PascalCase, snake_case, and kebab-case.
 */
function splitIdentifier(str: string): string[] {
  return str
    // Split camelCase and PascalCase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Split snake_case and kebab-case
    .replace(/[_-]/g, ' ')
    .split(/\s+/)
    .map(s => s.toLowerCase())
    .filter(s => s.length > 1);
}

/**
 * Extract keywords from a file path.
 * 
 * Enhanced extraction that:
 * - Splits camelCase/PascalCase filenames
 * - Extracts directory segments
 * - Recognizes common patterns (Service, Controller, etc.)
 * 
 * @param filepath - File path to extract keywords from
 * @returns Array of keywords from path segments
 */
export function extractPathKeywords(filepath: string): string[] {
  const keywords = new Set<string>();
  
  // Split path into segments (excluding extension)
  const pathWithoutExt = filepath.replace(/\.[^.]+$/, '');
  const segments = pathWithoutExt.split(/[/\\]/);
  
  for (const segment of segments) {
    if (segment.length < 2) continue;
    
    // Add the full segment
    const lower = segment.toLowerCase();
    if (!COMMON_KEYWORDS.has(lower) && lower.length > 2) {
      keywords.add(lower);
    }
    
    // Split camelCase/PascalCase/snake_case and add parts
    const parts = splitIdentifier(segment);
    for (const part of parts) {
      if (!COMMON_KEYWORDS.has(part) && part.length > 2) {
        keywords.add(part);
      }
    }
  }
  
  return Array.from(keywords);
}

/**
 * Path context information extracted from a file path.
 */
export interface PathContext {
  /** Directory segments (excluding filename) */
  segments: string[];
  /** Detected architectural layer (service, controller, repository, etc.) */
  layer?: string;
  /** Detected feature domain (auth, users, payments, etc.) */
  domain?: string;
  /** Path depth (number of directory levels) */
  depth: number;
  /** Keywords extracted from the path */
  keywords: string[];
}

/**
 * Parse a file path and extract structural context.
 * 
 * This helps with:
 * - Boosting files in related directories
 * - Understanding architectural layer
 * - Grouping by feature domain
 * 
 * @param filepath - File path to parse
 * @returns Parsed path context
 */
export function parsePathContext(filepath: string): PathContext {
  const pathWithoutExt = filepath.replace(/\.[^.]+$/, '');
  const allSegments = pathWithoutExt.split(/[/\\]/);
  const filename = allSegments[allSegments.length - 1];
  const dirSegments = allSegments.slice(0, -1);
  
  // Extract keywords from all segments
  const keywords = extractPathKeywords(filepath);
  
  // Detect layer from filename and path
  let layer: string | undefined;
  const allLower = [...dirSegments, filename].map(s => s.toLowerCase()).join(' ');
  const filenameLower = filename.toLowerCase();
  
  for (const [layerName, patterns] of Object.entries(LAYER_PATTERNS)) {
    for (const pattern of patterns) {
      // Check filename first (higher priority)
      if (filenameLower.includes(pattern)) {
        layer = layerName;
        break;
      }
      // Check path segments
      if (dirSegments.some(s => s.toLowerCase() === pattern)) {
        layer = layerName;
        break;
      }
    }
    if (layer) break;
  }
  
  // Detect domain from non-layer directory names
  // e.g., src/services/auth/authService.ts → domain = "auth"
  // Traverse from innermost to outermost to find the most specific domain
  let domain: string | undefined;
  const layerPatternSet = new Set(Object.values(LAYER_PATTERNS).flat());
  
  // Create a reversed copy to traverse from innermost to outermost
  const reversedSegments = [...dirSegments].reverse();
  for (const segment of reversedSegments) {
    const lower = segment.toLowerCase();
    // Skip common non-domain directories
    if (['src', 'lib', 'app', 'packages', 'modules'].includes(lower)) continue;
    // Skip layer directories
    if (layerPatternSet.has(lower)) continue;
    // This is likely the domain
    if (lower.length > 2) {
      domain = lower;
      break;
    }
  }
  
  return {
    segments: dirSegments,
    layer,
    domain,
    depth: dirSegments.length,
    keywords,
  };
}

/**
 * Generate a path context string for embedding.
 * This is prepended to content to give the embedding model path awareness.
 * 
 * @param pathContext - Parsed path context
 * @returns A string representation of the path context
 */
export function formatPathContextForEmbedding(pathContext: PathContext): string {
  const parts: string[] = [];
  
  if (pathContext.domain) {
    parts.push(pathContext.domain);
  }
  
  if (pathContext.layer) {
    parts.push(pathContext.layer);
  }
  
  // Add significant path segments (limit to avoid noise)
  const significantSegments = pathContext.segments
    .slice(-3) // Last 3 directories
    .filter(s => s.length > 2 && !['src', 'lib', 'app'].includes(s.toLowerCase()));
  
  if (significantSegments.length > 0) {
    parts.push(...significantSegments.map(s => s.toLowerCase()));
  }
  
  if (parts.length === 0) return '';
  
  // Deduplicate
  const unique = [...new Set(parts)];
  return `[${unique.join(' ')}]`;
}

