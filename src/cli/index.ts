#!/usr/bin/env bun
// CLI command for indexing the current directory
import { indexDirectory } from '../indexer';
import { EMBEDDING_MODELS, getCacheDir } from '../utils/embeddings';

async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const showHelp = args.includes('--help') || args.includes('-h');
  
  if (showHelp) {
    const models = Object.keys(EMBEDDING_MODELS).join(', ');
    console.log(`
raggrep index - Index the current directory for semantic search

Usage:
  bun run index [options]

Options:
  -h, --help    Show this help message

Description:
  Indexes all supported files in the current directory and stores
  the index in .raggrep/. Run this command from the root of your project.

  On first run, the embedding model (~90MB) will be automatically
  downloaded and cached at: ${getCacheDir()}

Available Models:
  ${models}

  Configure in .raggrep/config.json:
  {
    "modules": [{
      "id": "semantic",
      "enabled": true,
      "options": {
        "embeddingModel": "all-MiniLM-L6-v2"
      }
    }]
  }

Examples:
  cd my-project && bun run index
`);
    process.exit(0);
  }

  console.log('RAGgrep Indexer');
  console.log('================\n');

  try {
    const rootDir = process.cwd();
    const results = await indexDirectory(rootDir);
    
    console.log('\n================');
    console.log('Summary:');
    for (const result of results) {
      console.log(`  ${result.moduleId}: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`);
    }
  } catch (error) {
    console.error('Error during indexing:', error);
    process.exit(1);
  }
}

main();
