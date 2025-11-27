# RAGgrep Documentation

RAGgrep is a local filesystem-based RAG (Retrieval-Augmented Generation) system for codebases. It indexes your code and allows semantic search using natural language queries.

## Table of Contents

- [Getting Started](./getting-started.md)
- [CLI Reference](./cli-reference.md)
- [Architecture](./architecture.md)
- [Configuration](./configuration.md)

## Quick Start

```bash
# Install dependencies
bun install

# Index your project
cd your-project
raggrep index

# Search your codebase
raggrep query "user authentication"
```

## Key Features

- **Local-first**: All indexing and search happens locally. No external API calls required.
- **Filesystem-based**: Index stored on disk, not in memory. Scales to large codebases.
- **Tiered search**: Fast keyword filtering (Tier 1) + semantic search (Tier 2) for efficiency.
- **Hybrid scoring**: Combines semantic similarity with BM25 keyword matching.
- **Zero configuration**: Works out of the box with sensible defaults.
- **Incremental indexing**: Only re-indexes files that have changed.
- **TypeScript-optimized**: AST-based parsing extracts functions, classes, interfaces, types.
- **Multiple embedding models**: Choose from several pre-trained models.
