# RAGgrep Documentation

RAGgrep is a **local filesystem-based RAG system** for codebases. It indexes your code and enables semantic search using natural language queries — all running locally on your machine.

## Table of Contents

- [Getting Started](./getting-started.md) — Installation and first steps
- [CLI Reference](./cli-reference.md) — All commands and options
- [Configuration](./configuration.md) — Customize indexing behavior
- [Architecture](./architecture.md) — How RAGgrep works internally

## Quick Start

```bash
# Install globally
npm install -g raggrep

# Or use without installing
npx raggrep index

# Navigate to your project and index
cd your-project
raggrep index

# Search your codebase
raggrep query "user authentication"
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Local-first** | All processing happens locally. No external API calls. |
| **Filesystem-based** | Index stored as readable JSON files alongside your code. |
| **Tiered search** | Fast BM25 keyword filtering + semantic embeddings for efficiency. |
| **Hybrid scoring** | Combines semantic similarity (70%) with keyword matching (30%). |
| **Incremental** | Only re-indexes files that have changed. |
| **TypeScript-optimized** | AST-based parsing extracts functions, classes, interfaces, types. |
| **Zero config** | Works out of the box with sensible defaults. |

## Design Philosophy

RAGgrep is built around three core principles:

1. **Lightweight** — No heavy dependencies, no databases, no servers.
2. **Filesystem-based** — The index is just JSON files. Human-readable, debuggable, portable.
3. **Persistent** — Index lives alongside your code. No rebuilding on every search.

This makes it ideal for:
- Developer tools (IDE extensions, CLI utilities)
- Small-to-medium codebases (1k–100k files)
- Offline development environments
- Projects where transparency matters

## What It's Not

RAGgrep is optimized for code search, not:
- Large-scale production vector databases
- Multi-million document search
- Real-time streaming updates

For those use cases, consider dedicated vector databases like Pinecone, Weaviate, or pgvector.
