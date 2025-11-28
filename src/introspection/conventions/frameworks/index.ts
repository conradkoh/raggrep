/**
 * Framework Conventions Registry
 *
 * Central registry for framework-specific conventions.
 * Add new frameworks here to extend convention support.
 */

import type { FrameworkConventions } from "../types";
import { nextjsFramework } from "./nextjs";
import { convexFramework } from "./convex";

/**
 * All registered framework convention providers.
 * Add new frameworks to this array.
 */
export const frameworkProviders: FrameworkConventions[] = [
  nextjsFramework,
  convexFramework,
];

/**
 * Get all framework conventions.
 */
export function getAllFrameworkConventions() {
  return frameworkProviders.flatMap((f) => f.conventions);
}

/**
 * Get frameworks by ID.
 */
export function getFramework(id: string): FrameworkConventions | undefined {
  return frameworkProviders.find((f) => f.id === id);
}

// Re-export individual frameworks
export { nextjsFramework } from "./nextjs";
export { convexFramework } from "./convex";
