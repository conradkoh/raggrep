/**
 * Symbolic Index System
 *
 * @deprecated Import from 'infrastructure/storage' instead.
 * This file re-exports for backwards compatibility.
 */

export { SymbolicIndex, getSymbolicPath } from "../infrastructure/storage";
export type { FileSummary, SymbolicIndexMeta } from "../domain/entities";
export { extractKeywords } from "../domain/services/keywords";

/** @deprecated Use SymbolicIndex instead */
export { SymbolicIndex as Tier1Index } from "../infrastructure/storage";

import * as path from "path";

/** @deprecated Use SymbolicIndex instead */
export function getTier1Path(
  rootDir: string,
  moduleId: string,
  indexDir: string = ".raggrep"
): string {
  return path.join(rootDir, indexDir, "index", moduleId, "tier1.json");
}
