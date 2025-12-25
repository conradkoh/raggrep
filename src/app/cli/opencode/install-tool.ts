/**
 * OpenCode Tool Installation (Legacy)
 * 
 * Version Compatibility: OpenCode versions < v1.0.186
 * 
 * This module installs raggrep as an OpenCode tool for older versions of OpenCode
 * that do not support the skill system. Tools are TypeScript files placed in
 * ~/.config/opencode/tool/ that provide direct execution capabilities.
 * 
 * Migration Note:
 * - Users should upgrade to OpenCode v1.0.186+ to use the newer skill-based approach
 * - This tool-based approach will be deprecated in future versions
 */

import type { Logger } from "../../../domain/ports";

export interface ToolInstallOptions {
  logger?: Logger;
  checkForOldSkill?: boolean;
}

export interface ToolInstallResult {
  success: boolean;
  toolPath?: string;
  message: string;
  removedOldSkill?: boolean;
}

/**
 * Install raggrep as an OpenCode tool for older versions
 */
export async function installTool(options: ToolInstallOptions = {}): Promise<ToolInstallResult> {
  const { logger, checkForOldSkill = true } = options;
  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");

  const homeDir = os.homedir();
  const toolDir = path.join(homeDir, ".config", "opencode", "tool");
  const toolPath = path.join(toolDir, "raggrep.ts");

  let removedOldSkill = false;

  const toolContent = `import { tool } from "@opencode-ai/plugin";

/**
 * Get the package executor command (pnpx if available, otherwise npx)
 */
async function getExecutor(): Promise<string> {
  try {
    // Try to find pnpm first (faster)
    await Bun.spawn(['pnpm', '--version'], { stdout: 'pipe', stderr: 'pipe' }).exited;
    return 'pnpx';
  } catch {
    // Fall back to npx
    return 'npx';
  }
}

/**
 * Get the installed raggrep version
 */
async function getRagrepVersion(executor: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([executor, 'raggrep', '--version'], { stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(proc.stdout).text();
    const match = output.match(/v([\\\\d.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export default tool({
  description:
    "Semantic code search powered by RAG - understands INTENT, not just literal text. Parses code using AST to extract functions, classes, and symbols with full context. Finds relevant code even when exact keywords don't match. Superior to grep for exploratory searches like 'authentication logic', 'error handling patterns', or 'configuration loading'.\\\\n\\\\n🎯 USE THIS TOOL FIRST when you need to:\\\\n• Find WHERE code is located (functions, components, services)\\\\n• Understand HOW code is structured\\\\n• Discover RELATED code across multiple files\\\\n• Get a QUICK overview of a topic\\\\n\\\\n❌ DON'T read multiple files manually when you can:\\\\n  raggrep(\\"user authentication\\", { filter: [\\"src/\\"] })\\\\n\\\\n✅ INSTEAD of reading files one-by-one, search semantically:\\\\n  • \\"Find the auth middleware\\" vs read: auth.ts, middleware.ts, index.ts...\\\\n  • \\"Where are React components?\\" vs read: App.tsx, components/*, pages/*...\\\\n  • \\"Database connection logic?\\" vs read: db.ts, config.ts, models/*...\\\\n  • \\"Error handling patterns\\" vs read: error.ts, middleware.ts, handlers/*...\\\\n\\\\nThis saves ~10x tool calls and provides BETTER context by showing related code across the entire codebase.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Natural language search query describing what you want to find. Be specific: 'auth middleware that checks JWT', 'React hooks for data fetching', 'database connection pool config'. This is MUCH faster than reading files manually."
      ),
    filter: tool.schema
      .array(tool.schema.string())
      .describe(
        "Array of path prefixes or glob patterns to narrow search scope (OR logic). If user mentions a directory, use it. Otherwise infer from context. Common patterns: ['src/auth'], ['*.tsx', 'components/'], ['api/', 'routes/'], ['docs/', '*.md'], ['*.test.ts']. For broad search use ['src/'] or ['**/*']."
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
      .describe(
        "Filter by single file extension without dot (e.g., 'ts', 'tsx', 'js', 'md'). Prefer using 'filter' with glob patterns like '*.ts' for more flexibility."
      ),
  },
  async execute(args) {
    const executor = await getExecutor();
    const version = await getRagrepVersion(executor);

    if (!version) {
      return \`Error: raggrep not found. Install it with: \${executor} install -g raggrep\`;
    }

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

    const proc = Bun.spawn([executor, 'raggrep', 'query', ...cmdArgs], { stdout: 'pipe' });
    const result = await new Response(proc.stdout).text();
    return result.trim();
  },
});
`;

  try {
    // Check for old skill file for mutual exclusivity
    if (checkForOldSkill) {
      const oldSkillDir = path.join(homeDir, ".config", "opencode", "skill", "raggrep");
      const oldSkillPath = path.join(oldSkillDir, "SKILL.md");
      
      let oldSkillExists = false;
      try {
        await fs.access(oldSkillPath);
        oldSkillExists = true;
      } catch {
        // Old skill file doesn't exist
      }

      if (oldSkillExists) {
        const message = "Found existing raggrep skill from previous installation.";
        const locationMessage = `  Location: ${oldSkillPath}`;
        
        if (logger) {
          logger.info(message);
          logger.info(locationMessage);
        } else {
          console.log(message);
          console.log(locationMessage);
        }
        
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question("Remove the existing skill and install tool? (Y/n): ", resolve);
        });
        
        rl.close();

        const shouldDelete = answer.toLowerCase() !== 'n';
        
        if (shouldDelete) {
          try {
            await fs.unlink(oldSkillPath);
            
            // Explicitly check if directory is empty before attempting removal
            const skillDirContents = await fs.readdir(oldSkillDir);
            if (skillDirContents.length === 0) {
              try {
                await fs.rmdir(oldSkillDir);
                console.log("✓ Removed old skill directory.");
              } catch (rmdirError) {
                console.log("✓ Removed old skill file. (Directory not empty or other error)");
              }
            } else {
              console.log("✓ Removed old skill file. (Directory not empty, keeping structure)");
            }
            
            removedOldSkill = true;
            
            const successMessage = "✓ Removed old skill file.";
            if (logger) {
              logger.info(successMessage);
            } else {
              console.log(successMessage);
            }
          } catch (error) {
            const warnMessage = `Warning: Could not remove old skill file: ${error}`;
            if (logger) {
              logger.warn(warnMessage);
            } else {
              console.warn(warnMessage);
            }
          }
        } else {
          const keepMessage = "Keeping existing skill. Tool installation cancelled.";
          if (logger) {
            logger.info(keepMessage);
          } else {
            console.log(keepMessage);
          }
          return {
            success: false,
            message: keepMessage,
          };
        }
      }
    }

    // Create directory if it doesn't exist
    await fs.mkdir(toolDir, { recursive: true });

    // Write the tool file
    await fs.writeFile(toolPath, toolContent, "utf-8");

    const message = `Installed raggrep tool for OpenCode.
  Location: ${toolPath}

The raggrep tool is now available in OpenCode.`;

    if (logger) {
      logger.info(message);
    } else {
      console.log(message);
    }

    return {
      success: true,
      toolPath,
      message,
      removedOldSkill,
    };
  } catch (error) {
    const message = `Error installing OpenCode tool: ${error}`;
    
    if (logger) {
      logger.error(message);
    } else {
      console.error(message);
    }

    return {
      success: false,
      message,
    };
  }
}