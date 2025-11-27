#!/usr/bin/env bun
// Main CLI entry point for raggrep

import { EMBEDDING_MODELS, getCacheDir, type EmbeddingModelName } from '../utils/embeddings';

const args = process.argv.slice(2);
const command = args[0];

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
    remaining: [],
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      flags.verbose = true;
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
  -m, --model <name>   Embedding model to use (default: all-MiniLM-L6-v2)
  -v, --verbose        Show detailed progress
  -h, --help           Show this help message

Available Models:
  ${models}

Model Cache: ${getCacheDir()}

Examples:
  raggrep index
  raggrep index --model bge-small-en-v1.5
  raggrep index --verbose
`);
        process.exit(0);
      }

      const { indexDirectory } = await import('../indexer');
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

Examples:
  raggrep query "user authentication"
  raggrep query "handle errors" --top 5
  raggrep query "database" --min-score 0.1
  raggrep query "interface" --type ts
`);
        process.exit(0);
      }

      const { search, formatSearchResults } = await import('../search');
      const query = flags.remaining[0];
      
      if (!query) {
        console.error('Usage: raggrep query <search query>');
        console.error('Run "raggrep query --help" for more information.');
        process.exit(1);
      }
      
      console.log('RAGgrep Search');
      console.log('==============\n');
      try {
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

    default:
      console.log(`
raggrep - Local filesystem-based RAG system for codebases

Usage:
  raggrep <command> [options]

Commands:
  index    Index the current directory
  query    Search the indexed codebase
  cleanup  Remove stale index entries for deleted files

Options:
  -h, --help   Show help for a command

Examples:
  raggrep index
  raggrep index --model bge-small-en-v1.5
  raggrep query "user login"
  raggrep query "handle errors" --top 5
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
