/**
 * OpenCode Version Checker
 * 
 * Determines whether to use tool or skill installation based on OpenCode version.
 * 
 * Version Compatibility:
 * - OpenCode versions < v1.0.186: Use tool-based installation
 * - OpenCode versions >= v1.0.186: Use skill-based installation
 */

export interface OpenCodeVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parse OpenCode version string into comparable components
 */
export function parseOpenCodeVersion(version: string): OpenCodeVersion | null {
  // Handle versions like "v1.0.186", "1.0.186", "v1.2.0", etc.
  const match = version.match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Check if OpenCode version supports skills (v1.0.186+)
 */
export function supportsSkills(version: string): boolean {
  const parsed = parseOpenCodeVersion(version);
  if (!parsed) {
    // If we can't parse the version, assume it supports skills (newer approach)
    return true;
  }

  // v1.0.186+ supports skills
  if (parsed.major > 1) return true;
  if (parsed.major === 1 && parsed.minor > 0) return true;
  if (parsed.major === 1 && parsed.minor === 0 && parsed.patch >= 186) return true;

  return false;
}

/**
 * Get installation method recommendation based on OpenCode version
 */
export function getInstallationMethod(openCodeVersion?: string): 'tool' | 'skill' {
  if (!openCodeVersion) {
    // If no version specified, default to skill (newer approach)
    return 'skill';
  }

  return supportsSkills(openCodeVersion) ? 'skill' : 'tool';
}

/**
 * Detect OpenCode version by checking common installation locations
 */
export async function detectOpenCodeVersion(): Promise<string | null> {
  try {
    const os = await import("os");
    const fs = await import("fs/promises");
    const path = await import("path");

    const homeDir = os.homedir();
    
    // Check common OpenCode installation paths
    const possiblePaths = [
      path.join(homeDir, ".local", "share", "opencode", "package.json"),
      path.join(homeDir, ".config", "opencode", "package.json"),
      path.join(homeDir, ".npm", "global", "node_modules", "opencode", "package.json"),
    ];

    for (const packagePath of possiblePaths) {
      try {
        const content = await fs.readFile(packagePath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.version) {
          return pkg.version;
        }
      } catch {
        // Continue to next path
      }
    }

    // Try to get version from opencode command if available
    try {
      const { spawn } = await import("child_process");
      return new Promise((resolve) => {
        const proc = spawn("opencode", ["--version"], { stdio: "pipe" });
        
        let version = "";
        proc.stdout.on("data", (data) => {
          version += data.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            // Extract version from output like "OpenCode v1.0.190"
            const match = version.match(/v?(\d+\.\d+\.\d+)/);
            resolve(match ? match[1] : null);
          } else {
            resolve(null);
          }
        });

        // Timeout after 3 seconds
        setTimeout(() => {
          proc.kill();
          resolve(null);
        }, 3000);
      });
    } catch {
      // opencode command not available
    }

    return null;
  } catch {
    return null;
  }
}