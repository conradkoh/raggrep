/**
 * Session Management Module
 *
 * Manages user sessions with Redis-backed storage.
 * Handles session creation, validation, and cleanup.
 */

import { randomUUID } from "crypto";

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
  deviceType?: string;
}

const SESSION_TTL_HOURS = 24;

/**
 * Create a new session for a user
 */
export async function createSession(
  userId: string,
  metadata: SessionMetadata,
  sessionStore: SessionStore
): Promise<Session> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000
  );

  const session: Session = {
    id: randomUUID(),
    userId,
    createdAt: now,
    expiresAt,
    metadata,
  };

  await sessionStore.save(session);
  return session;
}

/**
 * Validate a session by ID
 */
export async function validateSession(
  sessionId: string,
  sessionStore: SessionStore
): Promise<Session | null> {
  const session = await sessionStore.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    await sessionStore.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Invalidate/logout a session
 */
export async function invalidateSession(
  sessionId: string,
  sessionStore: SessionStore
): Promise<void> {
  await sessionStore.delete(sessionId);
}

/**
 * Invalidate all sessions for a user (logout everywhere)
 */
export async function invalidateAllUserSessions(
  userId: string,
  sessionStore: SessionStore
): Promise<number> {
  return sessionStore.deleteByUserId(userId);
}

interface SessionStore {
  save(session: Session): Promise<void>;
  get(sessionId: string): Promise<Session | null>;
  delete(sessionId: string): Promise<void>;
  deleteByUserId(userId: string): Promise<number>;
}

