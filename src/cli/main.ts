// Main CLI entry point for raggrep

import { EMBEDDING_MODELS, getCacheDir } from '../infrastructure/embeddings';
import type { EmbeddingModelName } from '../domain/ports';
import { createRequire } from 'module';

// Read version from package.json
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');
const VERSION = pkg.version;

const args = process.argv.slice(2);
const command = args[0];

// Handle --version / -v at top level (before any command)
if (command === '--version' || command === '-v') {
  console.log(`raggrep v${VERSION}`);
  process.exit(0);
}

/**
 * Format a date as a human-readable "time ago" string
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // For older dates, show the actual date
  return date.toLocaleDateString();
}

/**
 * Parsed CLI flags from command line arguments
 */
interface ParsedFlags {
  /** Embedding model to use */
  model?: EmbeddingModelName;
  /** Number of results to return */
  topK?: number;
  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
  /** File extension filter (e.g., 'ts', 'tsx') */
  fileType?: string;
  /** Show help message */
  help: boolean;
  /** Show detailed progress */
  verbose: boolean;
  /** Watch mode for continuous indexing */
  watch: boolean;
  /** Remaining positional arguments */
  remaining: string[];
}

/**
 * Parse CLI flags from command line arguments
 * @param args - Array of command line arguments (excluding command name)
 * @returns Parsed flags object
 */
function parseFlags(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {
    help: false,
    verbose: false,
    watch: false,
    remaining: [],
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      flags.verbose = true;
    } else if (arg === '--watch' || arg === '-w') {
      flags.watch = true;
    } else if (arg === '--model' || arg === '-m') {
      const modelName = args[++i];
      if (modelName && modelName in EMBEDDING_MODELS) {
        flags.model = modelName as EmbeddingModelName;
      } else {
        console.error(`Invalid model: ${modelName}`);
        console.error(`Available models: ${Object.keys(EMBEDDING_MODELS).join(', ')}`);
        process.exit(1);
      }
    } else if (arg === '--top' || arg === '-k') {
      const k = parseInt(args[++i], 10);
      if (!isNaN(k) && k > 0) {
        flags.topK = k;
      }
    } else if (arg === '--min-score' || arg === '-s') {
      const score = parseFloat(args[++i]);
      if (!isNaN(score) && score >= 0 && score <= 1) {
        flags.minScore = score;
      } else {
        console.error(`Invalid min-score: ${args[i]}. Must be a number between 0 and 1.`);
        process.exit(1);
      }
    } else if (arg === '--type' || arg === '-t') {
      const type = args[++i];
      if (type) {
        // Normalize: remove leading dot if present
        flags.fileType = type.startsWith('.') ? type.slice(1) : type;
      } else {
        console.error('--type requires a file extension (e.g., ts, tsx, js)');
        process.exit(1);
      }
    } else if (!arg.startsWith('-')) {
      flags.remaining.push(arg);
    }
  }
  
  return flags;
}

async function main() {
  const flags = parseFlags(args.slice(1)); // Skip the command itself
  
  switch (command) {
    case 'index': {
      if (flags.help) {
        const models = Object.keys(EMBEDDING_MODELS).join(', ');
        console.log(`
raggrep index - Index the current directory for semantic search

Usage:
  raggrep index [options]

Options:
  -w, --watch          Watch for file changes and re-index automatically
  -m, --model <name>   Embedding model to use (default: all-MiniLM-L6-v2)
  -v, --verbose        Show detailed progress
  -h, --help           Show this help message

Available Models:
  ${models}

Model Cache: ${getCacheDir()}

Examples:
  raggrep index
  raggrep index --watch
  raggrep index --model bge-small-en-v1.5
  raggrep index --verbose
`);
        process.exit(0);
      }

      const { indexDirectory, watchDirectory } = await import('../indexer');
      
      // Initial indexing
      console.log('RAGgrep Indexer');
      console.log('================\n');
      try {
        const results = await indexDirectory(process.cwd(), { 
          model: flags.model,
          verbose: flags.verbose,
        });
        console.log('\n================');
        console.log('Summary:');
        for (const result of results) {
          console.log(`  ${result.moduleId}: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`);
        }
      } catch (error) {
        console.error('Error during indexing:', error);
        process.exit(1);
      }

      // Watch mode
      if (flags.watch) {
        console.log('\n┌─────────────────────────────────────────┐');
        console.log('│  Watching for changes... (Ctrl+C to stop) │');
        console.log('└─────────────────────────────────────────┘\n');

        try {
          const watcher = await watchDirectory(process.cwd(), {
            model: flags.model,
            verbose: flags.verbose,
            onFileChange: (event, filepath) => {
              if (flags.verbose) {
                const symbol = event === 'add' ? '＋' : event === 'unlink' ? '－' : '～';
                console.log(`  ${symbol} ${filepath}`);
              }
            },
          });

          // Handle graceful shutdown
          const shutdown = async () => {
            console.log('\n\nStopping watcher...');
            await watcher.stop();
            console.log('Done.');
            process.exit(0);
          };

          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);

          // Keep the process running
          await new Promise(() => {}); // Never resolves
        } catch (error) {
          console.error('Error starting watcher:', error);
          process.exit(1);
        }
      }
      break;
    }

    case 'query': {
      if (flags.help) {
        console.log(`
raggrep query - Search the indexed codebase

Usage:
  raggrep query <search query> [options]

Options:
  -k, --top <n>        Number of results to return (default: 10)
  -s, --min-score <n>  Minimum similarity score 0-1 (default: 0.15)
  -t, --type <ext>     Filter by file extension (e.g., ts, tsx, js)
  -h, --help           Show this help message

Note:
  If the current directory has not been indexed, raggrep will
  automatically index it before searching.

Examples:
  raggrep query "user authentication"
  raggrep query "handle errors" --top 5
  raggrep query "database" --min-score 0.1
  raggrep query "interface" --type ts
`);
        process.exit(0);
      }

      const { search, formatSearchResults } = await import('../search');
      const { getIndexStatus, indexDirectory } = await import('../indexer');
      const query = flags.remaining[0];
      
      if (!query) {
        console.error('Usage: raggrep query <search query>');
        console.error('Run "raggrep query --help" for more information.');
        process.exit(1);
      }
      
      try {
        // Check if index exists, if not, create it first
        const status = await getIndexStatus(process.cwd());
        
        if (!status.exists) {
          console.log('No index found. Indexing directory first...\n');
          console.log('RAGgrep Indexer');
          console.log('================\n');
          
          const indexResults = await indexDirectory(process.cwd(), { 
            model: flags.model,
            verbose: false,
          });
          
          console.log('\n================');
          console.log('Summary:');
          for (const result of indexResults) {
            console.log(`  ${result.moduleId}: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`);
          }
          console.log('');
        }
        
        console.log('RAGgrep Search');
        console.log('==============\n');
        
        // Build file patterns if type filter specified
        const filePatterns = flags.fileType ? [`*.${flags.fileType}`] : undefined;
        
        const results = await search(process.cwd(), query, { 
          topK: flags.topK ?? 10,
          minScore: flags.minScore,
          filePatterns,
        });
        console.log(formatSearchResults(results));
      } catch (error) {
        console.error('Error during search:', error);
        process.exit(1);
      }
      break;
    }

    case 'cleanup': {
      if (flags.help) {
        console.log(`
raggrep cleanup - Remove stale index entries for deleted files

Usage:
  raggrep cleanup [options]

Options:
  -v, --verbose        Show detailed progress
  -h, --help           Show this help message

Description:
  Scans the index and removes entries for files that no longer exist.
  Run this command after deleting files to clean up the index.

Examples:
  raggrep cleanup
  raggrep cleanup --verbose
`);
        process.exit(0);
      }

      const { cleanupIndex } = await import('../indexer');
      console.log('RAGgrep Cleanup');
      console.log('===============\n');
      try {
        const results = await cleanupIndex(process.cwd(), { 
          verbose: flags.verbose,
        });
        console.log('\n===============');
        console.log('Summary:');
        for (const result of results) {
          console.log(`  ${result.moduleId}: ${result.removed} removed, ${result.kept} kept`);
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      if (flags.help) {
        console.log(`
raggrep status - Show the current state of the index

Usage:
  raggrep status [options]

Options:
  -h, --help           Show this help message

Description:
  Displays information about the index in the current directory,
  including whether it exists, how many files are indexed, and
  when it was last updated.

Examples:
  raggrep status
`);
        process.exit(0);
      }

      const { getIndexStatus } = await import('../indexer');
      try {
        const status = await getIndexStatus(process.cwd());
        
        if (!status.exists) {
          console.log(`
┌─────────────────────────────────────────┐
│  RAGgrep Status                         │
├─────────────────────────────────────────┤
│  ○ Not indexed                          │
└─────────────────────────────────────────┘

  Directory: ${status.rootDir}

  Run "raggrep index" to create an index.
`);
        } else {
          const date = status.lastUpdated ? new Date(status.lastUpdated) : null;
          const timeAgo = date ? formatTimeAgo(date) : 'unknown';
          
          console.log(`
┌─────────────────────────────────────────┐
│  RAGgrep Status                         │
├─────────────────────────────────────────┤
│  ● Indexed                              │
└─────────────────────────────────────────┘

  Files:    ${status.totalFiles.toString().padEnd(10)} Updated: ${timeAgo}
  Location: ${status.indexDir}
`);
          if (status.modules.length > 0) {
            console.log('  Modules:');
            for (const mod of status.modules) {
              console.log(`    └─ ${mod.id} (${mod.fileCount} files)`);
            }
            console.log('');
          }
        }
      } catch (error) {
        console.error('Error getting status:', error);
        process.exit(1);
      }
      break;
    }

    default:
      console.log(`
raggrep v${VERSION} - Local filesystem-based RAG system for codebases

Usage:
  raggrep <command> [options]

Commands:
  index    Index the current directory
  query    Search the indexed codebase
  status   Show the current state of the index
  cleanup  Remove stale index entries for deleted files

Options:
  -h, --help     Show help for a command
  -v, --version  Show version number

Examples:
  raggrep index
  raggrep query "user login"
  raggrep status
  raggrep cleanup

Run 'raggrep <command> --help' for more information.
`);
      if (command && command !== '--help' && command !== '-h') {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
  }
}

main();
