/**
 * Application Use Cases
 * 
 * Business logic orchestration layer.
 * Use cases coordinate domain entities and infrastructure services.
 */

// Index Directory
export { 
  indexDirectory, 
  type IndexResult, 
  type IndexDirectoryOptions, 
  type IndexDirectoryDependencies 
} from './indexDirectory';

// Search Index
export { 
  searchIndex, 
  formatSearchResults,
  type SearchIndexOptions, 
  type SearchIndexDependencies 
} from './searchIndex';

// Cleanup Index
export { 
  cleanupIndex, 
  type CleanupResult, 
  type CleanupIndexOptions, 
  type CleanupIndexDependencies 
} from './cleanupIndex';

// Exact Search
export {
  executeExactSearch,
  matchesPathFilter,
  type ExactSearchOptions,
} from './exactSearch';
