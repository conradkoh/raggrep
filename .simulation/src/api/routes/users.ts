/**
 * User API Routes
 *
 * REST API endpoints for user management.
 * Includes CRUD operations and profile management.
 */

import { Router, Request, Response } from "express";
import { authenticateUser, hashPassword } from "../../auth/login";
import {
  createUser,
  findUserById,
  listUsers,
  deactivateUser,
} from "../../database/models/user";
import { validateRequest } from "../middleware/validation";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

/**
 * POST /api/users/register
 * Create a new user account
 */
router.post(
  "/register",
  validateRequest({
    body: {
      email: { type: "email", required: true },
      password: { type: "string", required: true, minLength: 8 },
      firstName: { type: "string", required: true },
      lastName: { type: "string", required: true },
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      const passwordHash = await hashPassword(password);
      const user = await createUser({
        email,
        passwordHash,
        firstName,
        lastName,
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      });
    } catch (error: any) {
      if (error.code === "23505") {
        // Unique violation
        res.status(409).json({ error: "Email already registered" });
      } else {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }
);

/**
 * POST /api/users/login
 * Authenticate user and return token
 */
router.post(
  "/login",
  validateRequest({
    body: {
      email: { type: "email", required: true },
      password: { type: "string", required: true },
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Note: Need to inject userRepository in real implementation
      const result = await authenticateUser(
        { email, password },
        userRepository
      );

      if (!result) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      res.json({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const user = await findUserById(userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/users
 * List all users (admin only)
 */
router.get("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await listUsers(page, pageSize);

    res.json({
      users: result.users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        createdAt: u.created_at,
      })),
      total: result.total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/users/:id
 * Deactivate a user (admin only)
 */
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deactivateUser(id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Placeholder for dependency injection
const userRepository = {
  findByEmail: async (email: string) => null,
  updateLastLogin: async (userId: string) => {},
};

export default router;




