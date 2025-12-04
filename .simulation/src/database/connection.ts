/**
 * Database Connection Module
 *
 * Manages PostgreSQL database connections using a connection pool.
 * Supports multiple environments and automatic reconnection.
 */

import { Pool, PoolClient } from "pg";

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

let pool: Pool | null = null;

/**
 * Initialize the database connection pool
 */
export async function initializeDatabase(
  config: DatabaseConfig
): Promise<void> {
  if (pool) {
    console.log("Database pool already initialized");
    return;
  }

  pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.maxConnections ?? 20,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30000,
  });

  // Test the connection
  const client = await pool.connect();
  try {
    await client.query("SELECT NOW()");
    console.log("Database connection established successfully");
  } finally {
    client.release();
  }
}

/**
 * Get a client from the connection pool
 */
export async function getConnection(): Promise<PoolClient> {
  if (!pool) {
    throw new Error("Database not initialized. Call initializeDatabase first.");
  }
  return pool.connect();
}

/**
 * Execute a query using the connection pool
 */
export async function executeQuery<T>(
  query: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getConnection();
  try {
    const result = await client.query(query, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/**
 * Execute a transaction with automatic rollback on error
 */
export async function executeTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getConnection();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close all database connections
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("Database connections closed");
  }
}

