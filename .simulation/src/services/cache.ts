/**
 * Cache Service
 *
 * Redis-based caching for improved performance.
 * Supports TTL, tags, and pattern-based invalidation.
 */

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  prefix?: string;
  defaultTTL?: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
  tags?: string[];
}

let cacheConfig: CacheConfig | null = null;
let memoryCache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL = 3600; // 1 hour

/**
 * Initialize the cache service
 */
export function initializeCache(config: CacheConfig): void {
  cacheConfig = config;
  // In production, this would connect to Redis
  console.log(`Cache initialized with prefix: ${config.prefix || "cache"}`);
}

/**
 * Get the prefixed key
 */
function getKey(key: string): string {
  const prefix = cacheConfig?.prefix || "cache";
  return `${prefix}:${key}`;
}

/**
 * Get a value from cache
 */
export async function get<T>(key: string): Promise<T | null> {
  const fullKey = getKey(key);
  const entry = memoryCache.get(fullKey) as CacheEntry<T> | undefined;

  if (!entry) {
    return null;
  }

  // Check expiration
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryCache.delete(fullKey);
    return null;
  }

  return entry.value;
}

/**
 * Set a value in cache
 */
export async function set<T>(
  key: string,
  value: T,
  options?: { ttl?: number; tags?: string[] }
): Promise<void> {
  const fullKey = getKey(key);
  const ttl = options?.ttl ?? cacheConfig?.defaultTTL ?? DEFAULT_TTL;

  const entry: CacheEntry<T> = {
    value,
    expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : undefined,
    tags: options?.tags,
  };

  memoryCache.set(fullKey, entry);
}

/**
 * Delete a value from cache
 */
export async function del(key: string): Promise<void> {
  const fullKey = getKey(key);
  memoryCache.delete(fullKey);
}

/**
 * Check if a key exists in cache
 */
export async function has(key: string): Promise<boolean> {
  const value = await get(key);
  return value !== null;
}

/**
 * Get or set - returns cached value or computes and caches a new one
 */
export async function getOrSet<T>(
  key: string,
  compute: () => Promise<T>,
  options?: { ttl?: number; tags?: string[] }
): Promise<T> {
  const cached = await get<T>(key);

  if (cached !== null) {
    return cached;
  }

  const value = await compute();
  await set(key, value, options);
  return value;
}

/**
 * Invalidate cache entries by tag
 */
export async function invalidateByTag(tag: string): Promise<number> {
  let count = 0;

  for (const [key, entry] of memoryCache.entries()) {
    if (entry.tags?.includes(tag)) {
      memoryCache.delete(key);
      count++;
    }
  }

  return count;
}

/**
 * Invalidate cache entries by pattern
 */
export async function invalidateByPattern(pattern: string): Promise<number> {
  const prefix = cacheConfig?.prefix || "cache";
  const fullPattern = `${prefix}:${pattern}`;
  const regex = new RegExp(fullPattern.replace("*", ".*"));
  let count = 0;

  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      count++;
    }
  }

  return count;
}

/**
 * Clear all cache entries
 */
export async function clear(): Promise<void> {
  memoryCache.clear();
}

/**
 * Get cache statistics
 */
export function getStats(): { size: number; keys: string[] } {
  return {
    size: memoryCache.size,
    keys: Array.from(memoryCache.keys()),
  };
}

