/**
 * User Authentication Module
 *
 * Handles user login, logout, and session management.
 * Uses JWT tokens for secure authentication.
 */

import { hash, compare } from "bcrypt";
import { sign, verify } from "jsonwebtoken";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  lastLogin?: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthToken {
  token: string;
  expiresAt: Date;
}

const JWT_SECRET = process.env.JWT_SECRET || "development-secret";
const TOKEN_EXPIRY = "24h";

/**
 * Authenticate a user with email and password
 * @param credentials - User login credentials
 * @param userRepository - Repository to fetch user data
 * @returns Authentication token if successful
 */
export async function authenticateUser(
  credentials: LoginCredentials,
  userRepository: UserRepository
): Promise<AuthToken | null> {
  const user = await userRepository.findByEmail(credentials.email);

  if (!user) {
    console.log(
      `Login attempt failed: user not found for ${credentials.email}`
    );
    return null;
  }

  const passwordValid = await compare(credentials.password, user.passwordHash);

  if (!passwordValid) {
    console.log(
      `Login attempt failed: invalid password for ${credentials.email}`
    );
    return null;
  }

  // Update last login timestamp
  await userRepository.updateLastLogin(user.id);

  // Generate JWT token
  const token = sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  return { token, expiresAt };
}

/**
 * Verify a JWT token and extract user info
 */
export function verifyToken(
  token: string
): { userId: string; email: string } | null {
  try {
    const decoded = verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
    };
    return decoded;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}

/**
 * Hash a password for secure storage
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return hash(password, saltRounds);
}

interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  updateLastLogin(userId: string): Promise<void>;
}




