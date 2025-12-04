# RAGgrep Documentation

RAGgrep is a **local semantic search tool** for codebases. It indexes your code and lets you search using natural language — all running locally on your machine.

## Table of Contents

- [Getting Started](./getting-started.md) — Installation and first steps
- [CLI Reference](./cli-reference.md) — All commands and options
- [SDK Reference](./sdk.md) — Programmatic API for Node.js/Bun
- [Configuration](./configuration.md) — Configuration options
- [Advanced](./advanced.md) — Maintenance and advanced features
- [Architecture](./architecture.md) — How RAGgrep works internally

### Design Documents

- [Literal Boosting](./design/literal-boosting.md) — Exact identifier matching
- [Introspection](./design/introspection.md) — Multi-index architecture
- [Structured Semantic Expansion](./design/structured-semantic-expansion.md) — Synonym-based query expansion (planned)

## Quick Start

```bash
# Install globally
npm install -g raggrep

# Search your codebase (auto-indexes on first run)
cd your-project
raggrep query "user authentication"
```

That's it. No separate index command needed — the index is created and maintained automatically.

## Key Features

| Feature                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| **Zero-config search** | Just run `raggrep query` and it works. Index managed auto.      |
| **Local-first**        | All processing happens locally. No external API calls.          |
| **Incremental**        | Only re-indexes files that have changed.                        |
| **Watch mode**         | Keep index fresh in real-time with `raggrep index --watch`.     |
| **Hybrid scoring**     | Combines semantic similarity with keyword matching (BM25).      |
| **Literal boosting**   | Exact identifier matches get priority (e.g., `` `AuthService` ``). |
| **TypeScript-aware**   | AST-based parsing extracts functions, classes, interfaces.      |
| **Path filtering**     | Filter results by path with `--filter src/auth`.                |

## How Auto-Indexing Works

The `raggrep query` command manages the index like a cache:

| Scenario       | What Happens                            |
| -------------- | --------------------------------------- |
| First query    | Creates full index, then searches       |
| No changes     | Uses cached index (instant)             |
| Files modified | Re-indexes changed files, then searches |
| Files deleted  | Removes stale entries, then searches    |

## Design Philosophy

RAGgrep is built around three core principles:

1. **Just Works** — Search your code without thinking about indexes.
2. **Filesystem-based** — The index is just JSON files. Human-readable, debuggable.
3. **Local-first** — Everything runs on your machine. No servers, no API calls.

This makes it ideal for:

- Developer tools (IDE extensions, CLI utilities)
- Small-to-medium codebases (1k–100k files)
- Offline development environments

## What It's Not

RAGgrep is optimized for code search, not:

- Large-scale production vector databases
- Multi-million document search
- Real-time streaming updates

For those use cases, consider dedicated vector databases like Pinecone, Weaviate, or pgvector.
