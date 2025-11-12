# Local Filesystem-Based RAG System for Codebases

## 🧩 Overview
This document describes a **lightweight, local-only Retrieval-Augmented Generation (RAG)** system designed specifically for **codebases**.  
The goal is to provide semantic search and code understanding capabilities **without** large, cloud-based infrastructure — using the **filesystem itself** as the persistent index.

---

## 🚀 High-Level Goals & Commands

### Indexing
**Command:**
```sh
raggrep index
```

**Result:**
```
.index folder populated with the index
```

### Retrieval
**Command:**
```sh
raggrep query "Where can I find the entrypoint for user management"
```

**Result:**
```
// List of ranked files, chunks
// Format TBD
```

---

## 🎯 Design Goals

| Goal | Description |
|------|--------------|
| **Local-first** | Runs entirely on a developer’s machine — no servers or external dependencies. |
| **Simple & Inspectable** | The index is just files and folders. No opaque databases. |
| **Incremental** | Index updates automatically when code changes (e.g. via `pre-commit` hook). |
| **Performant Enough** | Optimized for small-to-medium codebases (1k–100k chunks). |
| **Persistent & Portable** | The index lives alongside the repo and can be backed up or versioned. |

---

## 🏗️ System Architecture

### 1. **Index Layout**
The `.raggrep/` directory contains initialization metadata and an `index/data/` folder that mirrors the project's directory structure:

```
myrepo/
  src/
    utils/
      math.ts
      string.ts
    api/
      auth.ts
  README.md
  .raggrep/
    config.json          # initialization metadata
    index/
      data/
        src/
          utils/
            math.json
            string.json
          api/
            auth.json
        README.json
        manifest.json
```
myrepo/
  src/
    utils/
      math.ts
      string.ts
    api/
      auth.ts
  README.md
  .index/
    src/
      utils/
        math.json
        string.json
      api/
        auth.json
    README.json
    manifest.json
```

Each `.json` file contains chunk-level embeddings and metadata for its corresponding source file.

```json
{
  "filepath": "src/utils/math.ts",
  "chunks": [
    {
      "id": "src-utils-math-1",
      "content": "export function add(a, b) { return a + b; }",
      "embedding": [0.123, -0.532, ...],
      "lastModified": "2025-11-13T12:00:00Z"
    }
  ]
}
```

---

### 2. **Components**

#### 🧠 **Indexer**
Responsible for:
- Parsing code into semantic chunks (functions, classes, docstrings, comments).
- Generating embeddings for each chunk.
- Writing structured JSON or binary index files to `.index/`.

**Trigger:**  
- Automatically via a `pre-commit` hook or file watcher.
- Incrementally updates only changed files.

Example `pre-commit` hook:
```bash
changed_files=$(git diff --cached --name-only)
for f in $changed_files; do
  node scripts/updateIndex.js "$f"
done
```

---

#### 🔍 **Searcher**
Handles query processing and retrieval.

1. **Input:** Natural-language or code-based query.
2. **Synonym expansion:**  
   Expands terms like `"auth"` → `"login"`, `"authentication"`, `"jwt"`.
3. **Embedding:** Convert query to embedding.
4. **Vector search:**  
   - Load manifest or directory of embeddings.  
   - Compute cosine similarity to find top-K snippets.
5. **(Optional)**: Re-rank using a cross-encoder.

---

#### 💬 **RAG Query Interface**
A local CLI or VS Code extension can wrap the retrieval step and query an LLM:

```bash
raggrep "where do we validate API tokens?"
```

**Prompt template:**
```
You are analyzing the following codebase.
Query: "<user query>"

Relevant code snippets:
{{retrieved_code}}

Answer based only on these snippets.
```

---

#### 🔗 **Cross-Reference Reinforcement**

To improve retrieval accuracy, the system tracks and leverages import/reference relationships between files.

**1. Reference Extraction**
- During indexing, parse each file's AST to extract references to other files
- For TypeScript: extract `import` statements, `require()` calls, and dynamic imports
- Store reference metadata in each file's index entry

**2. Reference Score Boosting**
- When a file is retrieved in search results, increase the `reference_score` of all files it references by +1
- This propagates relevance to related code that may not have matched the query directly
- Example: If `userController.ts` is retrieved and imports `userService.ts`, boost `userService.ts`'s score

**3. Ranking Formula (TBD)**
- Final ranking will combine multiple factors:
  - Base semantic similarity score (cosine similarity)
  - Reference score (cross-reference boost)
  - Additional factors to be determined (recency, file importance, etc.)

**Index Structure Update:**
```json
{
  "filepath": "src/controllers/userController.ts",
  "chunks": [...],
  "references": [
    "src/services/userService.ts",
    "src/models/User.ts"
  ],
  "referencedBy": [
    "src/routes/userRoutes.ts"
  ]
}
```

---

### 3. **Data Flow**

```
[File Change] ──▶ [Indexer]
                    │
                    ├─ Generate embeddings
                    ├─ Write/Update .index files
                    └─ Update manifest.json
                             │
                             ▼
                    [Searcher / CLI]
                             │
                             ├─ Expand query
                             ├─ Retrieve embeddings
                             ├─ Compute similarity
                             └─ Return ranked snippets
```

---

## 🧱 Filesystem Index Details

### Storage Options

| Option | Format | Notes |
|---------|---------|-------|
| **Simple JSON (default)** | Human-readable | Easiest to debug; fine for ≤50 k chunks. |
| **Binary (MessagePack / Float32Array)** | Compact | Faster, smaller; less readable. |
| **Hybrid (manifest + shards)** | Metadata in JSON + embeddings.bin | Scales to 100 k + chunks efficiently. |

Example hybrid structure:
```
.index/
  manifest.json      # maps chunk IDs → embedding offsets
  embeddings.bin     # contiguous Float32 embeddings
  metadata/          # small JSON metadata per file
```

---

## ⚡ Performance Characteristics

| Operation | Filesystem Index | Notes |
|------------|------------------|-------|
| **Initial indexing (5 k chunks)** | 3–5 min | I/O and embedding-bound |
| **Incremental update (10 files)** | <2 s | Per-file writes only |
| **Query latency** | ~100 ms + model time | Local vector search |
| **Concurrent writes** | Safe (per-file updates) | No global lock |
| **Scalability** | Excellent up to 100 k chunks | Shard if larger |

---

## 🧠 Implementation Notes (TypeScript)

### Recommended Libraries
- `fs-extra` — filesystem traversal
- `globby` — file matching
- `better-sqlite3` *(optional)* — if hybrid storage later
- `cosine-similarity` or custom vector math
- `hnswlib-node` *(optional)* — in-memory ANN index
- `commander` / `yargs` — CLI interface
- `openai` / local model client — for embeddings

### Suggested Project Layout
```
src/
  indexer/
    parseCode.ts
    embed.ts
    writeIndex.ts
  search/
    queryExpand.ts
    vectorSearch.ts
  cli/
    main.ts
.index/
```

---

## 🧩 Comparison: Filesystem vs SQLite

| Factor | Filesystem Index | SQLite |
|---------|------------------|---------|
| Setup complexity | ⭐ Simple | ⭐ Simple |
| Transparency | ⭐⭐⭐⭐ | ⭐ |
| Incremental updates | ⭐⭐⭐⭐ | ⭐⭐ |
| Bulk search speed | ⭐⭐ | ⭐⭐⭐⭐ |
| Memory footprint | ⭐⭐⭐⭐ | ⭐⭐ |
| Query flexibility | ⭐ | ⭐⭐⭐⭐ |
| Concurrency | ⭐⭐⭐⭐ | ⭐⭐ |
| Debuggability | ⭐⭐⭐⭐ | ⭐ |
| Scalability (> 1 M chunks) | ⚠️ Moderate | ⚠️ Moderate |

---

## 🪶 Optimizations

1. **Directory Sharding**
   - Avoid thousands of files in a single directory by hashing filenames.  
     e.g. `.index/chunks/ab/abcd1234.json`

2. **Manifest Cache**
   - Maintain a small `manifest.json` that maps chunk IDs to file paths for faster lookup.

3. **Memory Mapping**
   - Store embeddings in contiguous binary buffers; map into memory for low-latency similarity search.

4. **Compression**
   - Gzip or LZ4 JSON index files; embeddings compress efficiently.

5. **Hierarchical Context Retrieval**
   - Aggregate per-directory summaries (like docstring embeddings) for broader queries.

---

## ✅ Summary

This design enables a **self-contained, local RAG system** tailored for developers.  
It avoids external databases and services, leveraging the filesystem as the natural structure for persistence and organization.

**Key Properties:**
- Fully offline  
- Incremental and fast  
- Transparent, debuggable  
- Scales to mid-sized repos  
- Easy to extend into a CLI or IDE integration

---

## 🧭 Future Enhancements
- Code-aware embeddings (e.g., `codebert`, `text-embedding-3-large`)
- Dependency graph–based retrieval (call graph context)
- Optional SQLite or FAISS backend if scaling beyond 100 k chunks
- Caching and background re-embedding on model upgrades

---

**Author:** _Local RAG Design Discussion Summary_  
**Date:** 2025-11-13
