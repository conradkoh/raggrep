/**
 * User Repository
 * Data access layer for user operations
 */

import { DatabasePool } from "../database/connection";
import { User, CreateUserInput, UpdateUserInput } from "./types";

/**
 * Repository for user CRUD operations
 */
export class UserRepository {
  private db: DatabasePool;

  constructor(db: DatabasePool) {
    this.db = db;
  }

  /**
   * Find a user by their ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Find a user by their email address
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Find all users with optional filtering
   */
  async findAll(filter?: {
    role?: string;
    isActive?: boolean;
  }): Promise<User[]> {
    let sql = "SELECT * FROM users WHERE 1=1";
    const params: unknown[] = [];

    if (filter?.role) {
      params.push(filter.role);
      sql += ` AND role = $${params.length}`;
    }

    if (filter?.isActive !== undefined) {
      params.push(filter.isActive);
      sql += ` AND is_active = $${params.length}`;
    }

    const result = await this.db.query<User>(sql, params);
    return result.rows;
  }

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<User> {
    const result = await this.db.query<User>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.email, input.password, input.name, input.role ?? "user"]
    );
    return result.rows[0];
  }

  /**
   * Update an existing user
   */
  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      params.push(input.name);
      fields.push(`name = $${params.length}`);
    }

    if (input.email !== undefined) {
      params.push(input.email);
      fields.push(`email = $${params.length}`);
    }

    if (input.role !== undefined) {
      params.push(input.role);
      fields.push(`role = $${params.length}`);
    }

    if (input.isActive !== undefined) {
      params.push(input.isActive);
      fields.push(`is_active = $${params.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    const result = await this.db.query<User>(
      `UPDATE users SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    return result.rows[0] ?? null;
  }

  /**
   * Delete a user by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM users WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  /**
   * Check if email is already taken
   */
  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    let sql = "SELECT COUNT(*) as count FROM users WHERE email = $1";
    const params: unknown[] = [email];

    if (excludeUserId) {
      params.push(excludeUserId);
      sql += ` AND id != $${params.length}`;
    }

    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0].count > 0;
  }
}
