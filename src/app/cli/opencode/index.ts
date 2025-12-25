/**
 * OpenCode Integration Module
 * 
 * This module provides version-aware installation of raggrep for OpenCode,
 * supporting both legacy tool-based installation (OpenCode < v1.0.186) and
 * modern skill-based installation (OpenCode >= v1.0.186).
 */

export * from "./version-check";
export * from "./install-tool";
export * from "./install-skill";