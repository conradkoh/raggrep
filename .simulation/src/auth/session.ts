// Session management
// Handles creating, validating, and destroying user sessions

import { generateToken } from '../utils/crypto';

export interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
}

const sessions = new Map<string, Session>();

/**
 * Creates a new session for a user
 */
export async function createSession(userId: string): Promise<Session> {
  const token = await generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  
  const session: Session = {
    id: crypto.randomUUID(),
    userId,
    token,
    createdAt: now,
    expiresAt,
  };
  
  sessions.set(token, session);
  return session;
}

/**
 * Destroys a session by token
 */
export async function destroySession(token: string): Promise<boolean> {
  return sessions.delete(token);
}

/**
 * Validates a session token and returns the session if valid
 */
export async function validateSession(token: string): Promise<Session | null> {
  const session = sessions.get(token);
  
  if (!session) {
    return null;
  }
  
  if (new Date() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  
  return session;
}

/**
 * Refreshes a session's expiration time
 */
export async function refreshSession(token: string): Promise<Session | null> {
  const session = sessions.get(token);
  
  if (!session) {
    return null;
  }
  
  session.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return session;
}
