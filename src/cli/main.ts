#!/usr/bin/env bun
// Main CLI entry point for raggrep

import { EMBEDDING_MODELS, getCacheDir, type EmbeddingModelName } from '../utils/embeddings';

const args = process.argv.slice(2);
const command = args[0];

// Parse CLI flags
function parseFlags(args: string[]): { 
  model?: EmbeddingModelName; 
  topK?: number;
  help: boolean;
  verbose: boolean;
  remaining: string[];
} {
  const flags: { model?: EmbeddingModelName; topK?: number; help: boolean; verbose: boolean; remaining: string[] } = {
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
  -k, --top <n>    Number of results to return (default: 10)
  -h, --help       Show this help message

Examples:
  raggrep query "user authentication"
  raggrep query "handle errors" --top 5
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
        const results = await search(process.cwd(), query, { topK: flags.topK ?? 10 });
        console.log(formatSearchResults(results));
      } catch (error) {
        console.error('Error during search:', error);
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
  index   Index the current directory
  query   Search the indexed codebase

Options:
  -h, --help   Show help for a command

Examples:
  raggrep index
  raggrep index --model bge-small-en-v1.5
  raggrep query "user login"
  raggrep query "handle errors" --top 5

Run 'raggrep <command> --help' for more information.
`);
      if (command && command !== '--help' && command !== '-h') {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
  }
}

main();
