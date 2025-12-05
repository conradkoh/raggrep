import { tool } from "@opencode-ai/plugin";

export default tool({
  description:
    "Search the codebase using semantic RAG (Retrieval-Augmented Generation). Uses raggrep to find relevant code snippets based on natural language queries. The index is managed automatically - first query creates it, changed files are re-indexed, and unchanged files use cached index.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Natural language search query (e.g., 'user authentication', 'handle errors')"
      ),
    top: tool.schema
      .number()
      .optional()
      .describe("Number of results to return (default: 10)"),
    minScore: tool.schema
      .number()
      .optional()
      .describe("Minimum similarity score 0-1 (default: 0.15)"),
    type: tool.schema
      .string()
      .optional()
      .describe("Filter by file extension (e.g., ts, tsx, js)"),
    filter: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe(
        "Filter by path prefix or glob pattern. Multiple filters use OR logic. Examples: 'src/auth', '*.ts', '*.md', 'src/**/*.test.ts'"
      ),
  },
  async execute(args) {
    const cmdArgs = [args.query];

    if (args.top !== undefined) {
      cmdArgs.push("--top", String(args.top));
    }
    if (args.minScore !== undefined) {
      cmdArgs.push("--min-score", String(args.minScore));
    }
    if (args.type !== undefined) {
      cmdArgs.push("--type", args.type);
    }
    if (args.filter !== undefined && args.filter.length > 0) {
      for (const f of args.filter) {
        cmdArgs.push("--filter", f);
      }
    }

    const result = await Bun.$`raggrep query ${cmdArgs}`.text();
    return result.trim();
  },
});
