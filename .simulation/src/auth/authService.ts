// User authentication service
// Handles user login, logout, and session management

import { User } from '../users/types';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { createSession, destroySession } from './session';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

/**
 * Authenticates a user with email and password
 * This is the main entry point for user login
 */
export async function login(credentials: LoginCredentials): Promise<AuthResult> {
  const { email, password } = credentials;
  
  // Find user by email
  const user = await findUserByEmail(email);
  
  if (!user) {
    return {
      success: false,
      error: 'Invalid email or password',
    };
  }
  
  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  
  if (!isValid) {
    return {
      success: false,
      error: 'Invalid email or password',
    };
  }
  
  // Create session and generate token
  const session = await createSession(user.id);
  
  return {
    success: true,
    user,
    token: session.token,
  };
}

/**
 * Logs out a user by destroying their session
 */
export async function logout(token: string): Promise<void> {
  await destroySession(token);
}

/**
 * Validates a session token and returns the associated user
 */
export async function validateToken(token: string): Promise<User | null> {
  // Implementation would validate JWT and return user
  return null;
}

async function findUserByEmail(email: string): Promise<User | null> {
  // Implementation would query database
  return null;
}
