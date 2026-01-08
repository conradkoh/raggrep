// Main CLI entry point for raggrep

import { EMBEDDING_MODELS, getCacheDir } from "../../infrastructure/embeddings";
import {
  createInlineLogger,
  createSilentLogger,
} from "../../infrastructure/logger";
import type { EmbeddingModelName } from "../../domain/ports";
// @ts-ignore - JSON import inlined by Bun at build time
import pkg from "../../../package.json";

const VERSION = pkg.version;

const args = process.argv.slice(2);
const command = args[0];

// Handle --version / -v at top level (before any command)
if (command === "--version" || command === "-v") {
  console.log(`raggrep v${VERSION}`);
  process.exit(0);
}

/**
 * Format a date as a human-readable "time ago" string
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older dates, show the actual date
  return date.toLocaleDateString();
}

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
  /** Path filter for search (e.g., 'src/auth') */
  pathFilter?: string[];
  /** Show help message */
  help: boolean;
  /** Show detailed progress */
  verbose: boolean;
  /** Watch mode for continuous indexing */
  watch: boolean;
  /** Number of files to process in parallel */
  concurrency?: number;
  /** Show timing information for performance profiling */
  timing: boolean;
  /** Force tool installation (mutually exclusive with --skill) */
  forceTool: boolean;
  /** Force skill installation (mutually exclusive with --tool) */
  forceSkill: boolean;
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
    watch: false,
    timing: false,
    forceTool: false,
    forceSkill: false,
    remaining: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--verbose" || arg === "-v") {
      flags.verbose = true;
    } else if (arg === "--watch" || arg === "-w") {
      flags.watch = true;
    } else if (arg === "--timing" || arg === "-T") {
      flags.timing = true;
    } else if (arg === "--model" || arg === "-m") {
      const modelName = args[++i];
      if (modelName && modelName in EMBEDDING_MODELS) {
        flags.model = modelName as EmbeddingModelName;
      } else {
        console.error(`Invalid model: ${modelName}`);
        console.error(
          `Available models: ${Object.keys(EMBEDDING_MODELS).join(", ")}`
        );
        process.exit(1);
      }
    } else if (arg === "--top" || arg === "-k") {
      const k = parseInt(args[++i], 10);
      if (!isNaN(k) && k > 0) {
        flags.topK = k;
      }
    } else if (arg === "--min-score" || arg === "-s") {
      const score = parseFloat(args[++i]);
      if (!isNaN(score) && score >= 0 && score <= 1) {
        flags.minScore = score;
      } else {
        console.error(
          `Invalid min-score: ${args[i]}. Must be a number between 0 and 1.`
        );
        process.exit(1);
      }
    } else if (arg === "--type" || arg === "-t") {
      const type = args[++i];
      if (type) {
        // Normalize: remove leading dot if present
        flags.fileType = type.startsWith(".") ? type.slice(1) : type;
      } else {
        console.error("--type requires a file extension (e.g., ts, tsx, js)");
        process.exit(1);
      }
    } else if (arg === "--concurrency" || arg === "-c") {
      const c = parseInt(args[++i], 10);
      if (!isNaN(c) && c > 0) {
        flags.concurrency = c;
      } else {
        console.error(
          `Invalid concurrency: ${args[i]}. Must be a positive integer.`
        );
        process.exit(1);
      }
    } else if (arg === "--filter" || arg === "-f") {
      const filterPath = args[++i];
      if (filterPath) {
        if (!flags.pathFilter) {
          flags.pathFilter = [];
        }
        flags.pathFilter.push(filterPath);
      } else {
        console.error(
          '--filter requires a path or glob pattern (e.g., src/auth, "*.ts")'
        );
        process.exit(1);
      }
    } else if (arg === "--tool") {
      flags.forceTool = true;
    } else if (arg === "--skill") {
      flags.forceSkill = true;
    } else if (!arg.startsWith("-")) {
      flags.remaining.push(arg);
    }
  }

  return flags;
}

async function main() {
  const flags = parseFlags(args.slice(1)); // Skip the command itself

  switch (command) {
    case "index": {
      if (flags.help) {
        const models = Object.keys(EMBEDDING_MODELS).join(", ");
        console.log(`
raggrep index - Index the current directory for semantic search

Usage:
  raggrep index [options]

Options:
  -w, --watch              Watch for file changes and re-index automatically
  -m, --model <name>       Embedding model to use (default: bge-small-en-v1.5)
  -c, --concurrency <n>    Number of files to process in parallel (default: auto)
  -v, --verbose            Show detailed progress
  -h, --help               Show this help message

Available Models:
  ${models}

Model Cache: ${getCacheDir()}

Examples:
  raggrep index
  raggrep index --watch
  raggrep index --model bge-small-en-v1.5
  raggrep index --concurrency 8
  raggrep index --verbose
`);
        process.exit(0);
      }

      const { indexDirectory, watchDirectory } = await import("../indexer");

      // Create inline logger for CLI (progress replaces current line)
      const logger = createInlineLogger({ verbose: flags.verbose });

      // Initial indexing
      console.log("RAGgrep Indexer");
      console.log("================\n");
      try {
        const results = await indexDirectory(process.cwd(), {
          model: flags.model,
          verbose: flags.verbose,
          concurrency: flags.concurrency,
          logger,
        });
        console.log("\n================");
        console.log("Summary:");
        for (const result of results) {
          console.log(
            `  ${result.moduleId}: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`
          );
        }
      } catch (error) {
        console.error("Error during indexing:", error);
        process.exit(1);
      }

      // Watch mode
      if (flags.watch) {
        console.log("\n┌─────────────────────────────────────────┐");
        console.log("│  Watching for changes... (Ctrl+C to stop) │");
        console.log("└─────────────────────────────────────────┘\n");

        try {
          const watcher = await watchDirectory(process.cwd(), {
            model: flags.model,
            verbose: flags.verbose,
            onFileChange: (event, filepath) => {
              if (flags.verbose) {
                const symbol =
                  event === "add" ? "＋" : event === "unlink" ? "－" : "～";
                console.log(`  ${symbol} ${filepath}`);
              }
            },
          });

          // Handle graceful shutdown
          const shutdown = async () => {
            console.log("\n\nStopping watcher...");
            await watcher.stop();
            console.log("Done.");
            process.exit(0);
          };

          process.on("SIGINT", shutdown);
          process.on("SIGTERM", shutdown);

          // Keep the process running
          await new Promise(() => {}); // Never resolves
        } catch (error) {
          console.error("Error starting watcher:", error);
          process.exit(1);
        }
      }
      break;
    }

    case "query": {
      if (flags.help) {
        console.log(`
raggrep query - Search the indexed codebase

Usage:
  raggrep query <search query> [options]

Options:
  -k, --top <n>        Number of results to return (default: 10)
  -s, --min-score <n>  Minimum similarity score 0-1 (default: 0.15)
  -t, --type <ext>     Filter by file extension (e.g., ts, tsx, js)
  -f, --filter <path>  Filter by path or glob pattern (can be used multiple times)
  -T, --timing         Show timing breakdown for performance profiling
  -h, --help           Show this help message

Note:
  The index is managed automatically like a cache:
  - First query creates the index
  - Changed files are re-indexed automatically
  - Deleted files are cleaned up automatically
  - Unchanged files use the cached index (instant)

Filter Patterns:
  Path prefix:    --filter src/auth          (matches src/auth/*)
  Glob pattern:   --filter "*.ts"            (matches all .ts files)
  Glob pattern:   --filter "*.md"            (matches all .md files)
  Glob pattern:   --filter "src/**/*.test.ts" (matches test files in src/)

Multiple Filters (OR logic):
  Use multiple --filter flags to match files that match ANY of the patterns.
  raggrep query "api" --filter "*.ts" --filter "*.tsx"  (matches .ts OR .tsx)
  raggrep query "docs" --filter "*.md" --filter docs/   (matches .md OR docs/)

Examples:
  raggrep query "user authentication"
  raggrep query "handle errors" --top 5
  raggrep query "database" --min-score 0.1
  raggrep query "interface" --type ts
  raggrep query "login" --filter src/auth
  raggrep query "api" --filter src/api --filter src/routes

  # Search only source code files
  raggrep query "service controller" --filter "*.ts"
  raggrep query "component state" --filter "*.tsx"

  # Search only documentation
  raggrep query "deployment workflow" --filter "*.md"

  # Search specific patterns
  raggrep query "test helpers" --filter "*.test.ts"
`);
        process.exit(0);
      }

      const { ensureIndexFresh } = await import("../indexer");
      const query = flags.remaining[0];

      if (!query) {
        console.error("Usage: raggrep query <search query>");
        console.error('Run "raggrep query --help" for more information.');
        process.exit(1);
      }

      try {
        // Create silent logger for background indexing during query
        const silentLogger = createSilentLogger();

        // Ensure index is fresh (creates if needed, updates if changed)
        const freshStats = await ensureIndexFresh(process.cwd(), {
          model: flags.model,
          quiet: true, // Suppress detailed indexing output
          logger: silentLogger,
          timing: flags.timing,
        });

        console.log("RAGgrep Search");
        console.log("==============\n");

        // Show brief index status summary
        if (freshStats.indexed > 0 || freshStats.removed > 0) {
          const parts: string[] = [];
          if (freshStats.indexed > 0) {
            parts.push(`${freshStats.indexed} indexed`);
          }
          if (freshStats.removed > 0) {
            parts.push(`${freshStats.removed} removed`);
          }
          console.log(`Using updated index: ${parts.join(", ")}\n`);
        } else {
          console.log("Using cached index (no changes detected).\n");
        }

        // Show timing information if requested
        if (flags.timing && freshStats.timing) {
          const t = freshStats.timing;
          console.log("┌─ Timing ───────────────────────────────────────────────┐");
          if (t.fromCache) {
            console.log(`│  Cache hit (TTL-based)                                 │`);
            console.log(`│  Total: ${t.totalMs.toFixed(0).padStart(6)}ms                                        │`);
          } else {
            console.log(`│  File discovery: ${t.fileDiscoveryMs.toFixed(0).padStart(6)}ms  │  ${String(t.filesDiscovered).padStart(6)} files, ${t.filesChanged} changed`.padEnd(57) + "│");
            console.log(`│  Indexing:       ${t.indexingMs.toFixed(0).padStart(6)}ms  │  ${String(t.filesReindexed).padStart(6)} reindexed`.padEnd(57) + "│");
            console.log(`│  Cleanup:        ${t.cleanupMs.toFixed(0).padStart(6)}ms  │`.padEnd(57) + "│");
            console.log(`│  ───────────────────────────────────────────────────── │`);
            console.log(`│  Total:          ${t.totalMs.toFixed(0).padStart(6)}ms`.padEnd(57) + "│");
          }
          console.log("└────────────────────────────────────────────────────────┘\n");
        }

        // Build file patterns if type filter specified
        const filePatterns = flags.fileType
          ? [`*.${flags.fileType}`]
          : undefined;

        // Use hybrid search to get both semantic and exact match results
        const { hybridSearch, formatHybridSearchResults } = await import("../search");

        const hybridResults = await hybridSearch(process.cwd(), query, {
          topK: flags.topK ?? 10,
          minScore: flags.minScore,
          filePatterns,
          pathFilter: flags.pathFilter,
          // Skip automatic freshness check since we already called ensureIndexFresh above
          ensureFresh: false,
        });
        console.log(formatHybridSearchResults(hybridResults));
      } catch (error) {
        console.error("Error during search:", error);
        process.exit(1);
      }
      break;
    }

    case "reset": {
      if (flags.help) {
        console.log(`
raggrep reset - Clear the index for the current directory

Usage:
  raggrep reset [options]

Options:
  -h, --help           Show this help message

Description:
  Completely removes the index for the current directory.
  The next 'raggrep index' or 'raggrep query' will rebuild from scratch.

Examples:
  raggrep reset
`);
        process.exit(0);
      }

      const { resetIndex } = await import("../indexer");

      try {
        const result = await resetIndex(process.cwd());
        console.log("Index cleared successfully.");
        console.log(`  Removed: ${result.indexDir}`);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("No index found")
        ) {
          console.error("Error: No index found for this directory.");
          process.exit(1);
        }
        console.error("Error during reset:", error);
        process.exit(1);
      }
      break;
    }

    case "status": {
      if (flags.help) {
        console.log(`
raggrep status - Show the current state of the index

Usage:
  raggrep status [options]

Options:
  -h, --help           Show this help message

Description:
  Displays information about the index in the current directory,
  including whether it exists, how many files are indexed, and
  when it was last updated.

Examples:
  raggrep status
`);
        process.exit(0);
      }

      const { getIndexStatus } = await import("../indexer");
      try {
        const status = await getIndexStatus(process.cwd());

        if (!status.exists) {
          console.log(`
┌─────────────────────────────────────────┐
│  RAGgrep Status                         │
├─────────────────────────────────────────┤
│  ○ Not indexed                          │
└─────────────────────────────────────────┘

  Directory: ${status.rootDir}

  Run "raggrep index" to create an index.
`);
        } else {
          const date = status.lastUpdated ? new Date(status.lastUpdated) : null;
          const timeAgo = date ? formatTimeAgo(date) : "unknown";

          console.log(`
┌─────────────────────────────────────────┐
│  RAGgrep Status                         │
├─────────────────────────────────────────┤
│  ● Indexed                              │
└─────────────────────────────────────────┘

  Files:    ${status.totalFiles.toString().padEnd(10)} Updated: ${timeAgo}
  Location: ${status.indexDir}
`);
          if (status.modules.length > 0) {
            console.log("  Modules:");
            for (const mod of status.modules) {
              console.log(`    └─ ${mod.id} (${mod.fileCount} files)`);
            }
            console.log("");
          }
        }
      } catch (error) {
        console.error("Error getting status:", error);
        process.exit(1);
      }
      break;
    }

    case "opencode": {
      const subcommand = flags.remaining[0];

      if (flags.help || !subcommand) {
        console.log(`
raggrep opencode - Manage OpenCode integration

Usage:
  raggrep opencode <subcommand> [options]

Subcommands:
  install    Install or update raggrep for OpenCode

Options:
  --tool     Force tool-based installation (default)
  --skill    Force skill-based installation

Description:
  Installs raggrep for OpenCode with mutual exclusivity:
  - Tool installation (default): ~/.config/opencode/tool/raggrep.ts
  - Skill installation: ~/.config/opencode/skill/raggrep/SKILL.md
  Installing one will prompt to remove the other (default: yes)

Examples:
  raggrep opencode install          # Install tool (default)
  raggrep opencode install --tool   # Force tool installation
  raggrep opencode install --skill  # Force skill installation
`);
        process.exit(0);
      }

      if (subcommand === "install") {
        // Validate mutual exclusivity
        if (flags.forceTool && flags.forceSkill) {
          console.error("Error: --tool and --skill flags are mutually exclusive");
          process.exit(1);
        }

        const {
          detectOpenCodeVersion,
          getInstallationMethod,
          installTool,
          installSkill,
        } = await import("./opencode");

        try {
          // Determine installation method: default to tool, respect explicit flags
          let method: 'tool' | 'skill';
          if (flags.forceTool) {
            method = 'tool';
          } else if (flags.forceSkill) {
            method = 'skill';
          } else {
            // Default to tool installation
            method = 'tool';
          }

          console.log("RAGgrep OpenCode Installer");
          console.log("==========================\n");

          if (flags.forceTool) {
            console.log("Forced tool-based installation (--tool flag)");
          } else if (flags.forceSkill) {
            console.log("Forced skill-based installation (--skill flag)");
          } else {
            console.log("Default tool-based installation");
          }
          
          console.log(`Installing ${method}...\n`);

          let result;
          if (method === 'tool') {
            result = await installTool({ checkForOldSkill: true });
          } else {
            result = await installSkill({ checkForOldTool: true });
          }

          if (!result.success) {
            process.exit(1);
          }

          console.log("\nInstallation completed successfully!");
        } catch (error) {
          console.error("Error during installation:", error);
          process.exit(1);
        }
      } else {
        console.error(`Unknown subcommand: ${subcommand}`);
        console.error('Run "raggrep opencode --help" for usage.');
        process.exit(1);
      }
      break;
    }

    default:
      console.log(`
raggrep v${VERSION} - Local filesystem-based RAG system for codebases

Usage:
  raggrep <command> [options]

Commands:
  index      Index the current directory
  query      Search the indexed codebase
  status     Show the current state of the index
  reset      Clear the index for the current directory
  opencode   Manage opencode integration

Options:
  -h, --help     Show help for a command
  -v, --version  Show version number

Examples:
  raggrep index
  raggrep query "user login"
  raggrep status
  raggrep reset
  raggrep opencode install

Run 'raggrep <command> --help' for more information.
`);
      if (command && command !== "--help" && command !== "-h") {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
  }
}

main();
