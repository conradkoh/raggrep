#!/usr/bin/env bun
// CLI command for querying the index
import { search, formatSearchResults } from '../search';

async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const showHelp = args.includes('--help') || args.includes('-h');
  
  if (showHelp || args.length === 0) {
    console.log(`
raggrep query - Search the indexed codebase

Usage:
  bun run query <search query> [options]

Options:
  -h, --help       Show this help message
  -k, --top-k <n>  Number of results to return (default: 10)

Description:
  Searches the indexed codebase using natural language queries.
  Run this command from the root of an indexed project.

Examples:
  bun run query "user login"
  bun run query "authentication middleware" -k 5
`);
    process.exit(showHelp ? 0 : 1);
  }

  // Extract query (first non-flag argument)
  let query = '';
  let topK = 10;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-k' || arg === '--top-k') {
      topK = parseInt(args[++i], 10) || 10;
    } else if (!arg.startsWith('-')) {
      query = arg;
    }
  }

  if (!query) {
    console.error('Error: Please provide a search query');
    process.exit(1);
  }

  console.log('RAGgrep Search');
  console.log('==============\n');

  try {
    const rootDir = process.cwd();
    const results = await search(rootDir, query, { topK });
    console.log(formatSearchResults(results));
  } catch (error) {
    console.error('Error during search:', error);
    process.exit(1);
  }
}

main();
