/**
 * Authentication Middleware
 *
 * Express middleware for handling JWT authentication and authorization.
 */

import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../auth/login";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role?: string;
      };
    }
  }
}

/**
 * Middleware to require authentication
 * Validates JWT token from Authorization header
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = {
    id: decoded.userId,
    email: decoded.email,
  };

  next();
}

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // First check authentication
  requireAuth(req, res, () => {
    if (!req.user) {
      return; // requireAuth already sent response
    }

    // Check admin role (would need to fetch from DB in real implementation)
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    next();
  });
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (decoded) {
      req.user = {
        id: decoded.userId,
        email: decoded.email,
      };
    }
  }

  next();
}





