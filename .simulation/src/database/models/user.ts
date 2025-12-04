/**
 * User Model
 *
 * Database model for user entities with CRUD operations.
 */

import { executeQuery, executeTransaction } from "../connection";

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: "admin" | "user" | "guest";
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: "admin" | "user" | "guest";
}

/**
 * Create a new user in the database
 */
export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const query = `
    INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
    RETURNING *
  `;

  const params = [
    input.email,
    input.passwordHash,
    input.firstName,
    input.lastName,
    input.role || "user",
  ];

  const result = await executeQuery<UserRecord>(query, params);
  return result[0];
}

/**
 * Find a user by email address
 */
export async function findUserByEmail(
  email: string
): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE email = $1 AND is_active = true`;
  const result = await executeQuery<UserRecord>(query, [email]);
  return result[0] || null;
}

/**
 * Find a user by ID
 */
export async function findUserById(id: string): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE id = $1`;
  const result = await executeQuery<UserRecord>(query, [id]);
  return result[0] || null;
}

/**
 * Update user's last login timestamp
 */
export async function updateUserLastLogin(userId: string): Promise<void> {
  const query = `UPDATE users SET updated_at = NOW() WHERE id = $1`;
  await executeQuery(query, [userId]);
}

/**
 * Deactivate a user account (soft delete)
 */
export async function deactivateUser(userId: string): Promise<void> {
  const query = `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`;
  await executeQuery(query, [userId]);
}

/**
 * List all active users with pagination
 */
export async function listUsers(
  page: number = 1,
  pageSize: number = 20
): Promise<{ users: UserRecord[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const countQuery = `SELECT COUNT(*) as total FROM users WHERE is_active = true`;
  const usersQuery = `
    SELECT * FROM users 
    WHERE is_active = true 
    ORDER BY created_at DESC 
    LIMIT $1 OFFSET $2
  `;

  const [countResult, usersResult] = await Promise.all([
    executeQuery<{ total: string }>(countQuery),
    executeQuery<UserRecord>(usersQuery, [pageSize, offset]),
  ]);

  return {
    users: usersResult,
    total: parseInt(countResult[0].total, 10),
  };
}

