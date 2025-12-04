# Index Feature Review Checklist

Review checklist for new indexing features to ensure correctness, performance, and incremental update support.

## Instructions

When adding a new index type (like literal index, reference index, etc.), run through this checklist to verify the implementation handles all edge cases correctly.

## Pre-Flight Checks

Before reviewing the feature, ensure:

```bash
# Run all tests
bun test --timeout 180000

# Run TypeScript type check
bunx tsc --noEmit
```

Both must pass before proceeding with the review.

## 1. Index Invalidation & Staleness

### File Modification

- [ ] When a file is **modified**, old index entries are removed before new ones are added
- [ ] Renamed identifiers (e.g., `foo` → `bar`) don't leave stale entries
- [ ] Line number changes don't create duplicate entries with different chunk IDs

**How to verify:**

1. Index a file with a function `testFunc`
2. Rename `testFunc` to `renamedFunc`
3. Re-index
4. Search for `testFunc` - should return NO results
5. Search for `renamedFunc` - should return the function

### File Deletion

- [ ] When a file is **deleted**, all its index entries are removed
- [ ] No orphaned entries remain in secondary indexes (literal, symbolic, etc.)

**How to verify:**

1. Index a file with identifiers
2. Delete the file from disk
3. Run index again (or cleanup)
4. Verify the index file JSON is gone
5. Verify secondary index entries are removed

### Chunk ID Stability

- [ ] Chunk IDs are deterministic (same content = same ID)
- [ ] Chunk IDs change appropriately when content changes
- [ ] Index correctly handles chunk ID changes on re-index

## 2. Incremental Updates

### Efficiency

- [ ] Only modified files are re-indexed (not the entire codebase)
- [ ] `finalize()` doesn't rebuild the entire index from scratch
- [ ] Secondary indexes support incremental updates (add/remove individual entries)

**How to verify:**

1. Index a large folder
2. Modify ONE file
3. Re-index with `--verbose`
4. Verify only 1 file shows as indexed (others show as unchanged)

### Data Structures

- [ ] Index has `removeFile(filepath)` method for cleanup
- [ ] Index has `removeChunk(chunkId)` method for granular cleanup
- [ ] Both methods properly update all internal data structures

### Finalize Hook

- [ ] Module's `finalize()` is called after indexing changes
- [ ] `finalize()` properly cleans up old data before adding new
- [ ] `finalize()` handles the case where some files were deleted

## 3. Storage & Persistence

### File Format

- [ ] Index is stored in JSON (human-readable, debuggable)
- [ ] Schema version is included for compatibility checking
- [ ] Version mismatch triggers appropriate warning or rebuild

### Paths

- [ ] Uses `getRaggrepDir()` for consistent index location
- [ ] Filepath keys are relative (not absolute) for portability
- [ ] Works correctly with the temp directory storage location

### Atomic Operations

- [ ] Index save is atomic (write to temp, then rename)
- [ ] Partial failures don't corrupt the index
- [ ] Index can recover from interrupted saves

## 4. Search Integration

### Query Processing

- [ ] Query terms are properly extracted/parsed
- [ ] Index is loaded once per search (not per-file)
- [ ] Search handles missing/empty index gracefully

### Result Merging

- [ ] Results from this index merge correctly with other sources
- [ ] Scoring is multiplicative or additive as designed
- [ ] No duplicate results from same chunk

### Two-Path Retrieval (if applicable)

- [ ] Index-only matches are included in results
- [ ] Properly loads chunks not found by semantic/BM25 search
- [ ] Base score is applied for index-only matches

## 5. Performance

### Memory

- [ ] Large indexes don't cause OOM
- [ ] Index is loaded lazily where possible
- [ ] Cleared from memory after use

### Speed

- [ ] Index lookup is O(1) or O(log n), not O(n)
- [ ] Building index doesn't block on I/O unnecessarily
- [ ] Search latency stays under 500ms for typical queries

### Scalability

- [ ] Tested with 1000+ files
- [ ] Index size grows linearly (not exponentially) with codebase

## 6. Edge Cases

### Empty/Missing

- [ ] Handles empty files gracefully
- [ ] Handles missing index directory (creates it)
- [ ] Handles corrupted index file (rebuilds)

### Special Characters

- [ ] Handles filenames with spaces
- [ ] Handles unicode in identifiers
- [ ] Handles very long identifiers

### Concurrent Access

- [ ] Multiple index processes don't corrupt data
- [ ] Watch mode handles rapid file changes

## Post-Review

After completing the review:

```bash
# Run all tests again
bun test --timeout 180000

# Run TypeScript type check
bunx tsc --noEmit

# Run manual sanity check (optional)
cd scenarios/basic
bun run ../../src/app/cli/main.ts index
bun run ../../src/app/cli/main.ts query "your test query" --top 5
```

## Checklist Template

Copy this for PR reviews:

```markdown
## Index Feature Review

### Pre-flight

- [ ] `bun test` passes
- [ ] `tsc --noEmit` passes

### Invalidation

- [ ] File modification cleans up old entries
- [ ] File deletion removes all entries
- [ ] Chunk IDs handled correctly

### Incremental

- [ ] Only modified files re-indexed
- [ ] Has `removeFile()` method
- [ ] `finalize()` handles cleanup

### Storage

- [ ] JSON format with version
- [ ] Correct paths with `getRaggrepDir()`

### Search

- [ ] Query parsing correct
- [ ] Results merge properly
- [ ] Index-only matches included

### Performance

- [ ] O(1) lookup
- [ ] Tested with large codebase
```

## Common Issues & Fixes

| Issue           | Symptom                        | Fix                                     |
| --------------- | ------------------------------ | --------------------------------------- |
| Stale entries   | Old identifiers still found    | Add `removeFile()` call in `finalize()` |
| Full rebuild    | Index slow after 1-file change | Check if `finalize()` clears everything |
| Missing results | Index-only matches not showing | Implement two-path retrieval            |
| Wrong paths     | Index not found                | Use `getRaggrepDir()` consistently      |
| Type errors     | Build fails                    | Export types from `domain/entities`     |
