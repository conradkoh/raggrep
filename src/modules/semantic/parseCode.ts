// Code parser - splits files into semantic chunks

export interface ParsedChunk {
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'block' | 'file';
}

// Simple chunking strategy: split by function/class definitions or by lines
export function parseCode(content: string, filepath: string): ParsedChunk[] {
  const lines = content.split('\n');

  const ext = filepath.split('.').pop()?.toLowerCase();

  // For TypeScript/JavaScript files, try to extract functions and classes
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) {
    return parseJSLikeCode(lines, content);
  }

  // For other files, use simple line-based chunking
  return parseGenericCode(lines, content);
}

function parseJSLikeCode(lines: string[], content: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];

  // Regex patterns for function and class detection
  const functionPatterns = [
    /^\s*(export\s+)?(async\s+)?function\s+\w+/,
    /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>/,
    /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/,
    /^\s*(public|private|protected)?\s*(static\s+)?(async\s+)?\w+\s*\([^)]*\)\s*[:{]/,
  ];
  const classPattern = /^\s*(export\s+)?(abstract\s+)?class\s+\w+/;

  let currentChunk: { startLine: number; type: 'function' | 'class' | 'block' } | null = null;
  let braceCount = 0;
  let inChunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for class start
    if (classPattern.test(line) && !inChunk) {
      currentChunk = { startLine: i, type: 'class' };
      braceCount = 0;
      inChunk = true;
    }
    // Check for function start
    else if (!inChunk) {
      for (const pattern of functionPatterns) {
        if (pattern.test(line)) {
          currentChunk = { startLine: i, type: 'function' };
          braceCount = 0;
          inChunk = true;
          break;
        }
      }
    }

    if (inChunk) {
      // Count braces
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      // End of chunk
      if (braceCount <= 0 && currentChunk && (line.includes('}') || line.includes(';'))) {
        chunks.push({
          content: lines.slice(currentChunk.startLine, i + 1).join('\n'),
          startLine: currentChunk.startLine + 1,
          endLine: i + 1,
          type: currentChunk.type,
        });
        inChunk = false;
        currentChunk = null;
        braceCount = 0;
      }
    }
  }

  // If no semantic chunks found, fall back to block-based chunking
  if (chunks.length === 0) {
    return parseGenericCode(lines, content);
  }

  return chunks;
}

function parseGenericCode(lines: string[], content: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
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

export function generateChunkId(filepath: string, startLine: number, endLine: number): string {
  const safePath = filepath.replace(/[/\\]/g, '-').replace(/\./g, '_');
  return `${safePath}-${startLine}-${endLine}`;
}
