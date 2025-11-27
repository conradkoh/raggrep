/**
 * User API Controller
 * HTTP handlers for user-related endpoints
 */

import { UserRepository } from '../users/userRepository';
import { CreateUserInput, UpdateUserInput, User } from '../users/types';
import { validateToken } from '../auth/authService';

export interface ApiRequest {
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  data?: unknown;
  error?: string;
}

/**
 * Controller for user API endpoints
 */
export class UserController {
  private userRepo: UserRepository;

  constructor(userRepo: UserRepository) {
    this.userRepo = userRepo;
  }

  /**
   * GET /users
   * List all users (requires admin)
   */
  async listUsers(req: ApiRequest): Promise<ApiResponse> {
    const user = await this.authenticate(req);
    if (!user || user.role !== 'admin') {
      return { status: 403, error: 'Forbidden' };
    }

    const filter = {
      role: req.query.role,
      isActive: req.query.isActive === 'true',
    };

    const users = await this.userRepo.findAll(filter);
    return { status: 200, data: users };
  }

  /**
   * GET /users/:id
   * Get a single user by ID
   */
  async getUser(req: ApiRequest): Promise<ApiResponse> {
    const user = await this.authenticate(req);
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    const { id } = req.params;
    
    // Users can only view themselves unless admin
    if (user.role !== 'admin' && user.id !== id) {
      return { status: 403, error: 'Forbidden' };
    }

    const targetUser = await this.userRepo.findById(id);
    if (!targetUser) {
      return { status: 404, error: 'User not found' };
    }

    return { status: 200, data: targetUser };
  }

  /**
   * POST /users
   * Create a new user (requires admin)
   */
  async createUser(req: ApiRequest): Promise<ApiResponse> {
    const user = await this.authenticate(req);
    if (!user || user.role !== 'admin') {
      return { status: 403, error: 'Forbidden' };
    }

    const input = req.body as CreateUserInput;
    
    // Validate input
    const validation = this.validateCreateInput(input);
    if (!validation.valid) {
      return { status: 400, error: validation.error };
    }

    // Check if email is taken
    if (await this.userRepo.isEmailTaken(input.email)) {
      return { status: 409, error: 'Email already exists' };
    }

    const newUser = await this.userRepo.create(input);
    return { status: 201, data: newUser };
  }

  /**
   * PUT /users/:id
   * Update an existing user
   */
  async updateUser(req: ApiRequest): Promise<ApiResponse> {
    const user = await this.authenticate(req);
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    const { id } = req.params;
    const input = req.body as UpdateUserInput;

    // Users can only update themselves unless admin
    if (user.role !== 'admin' && user.id !== id) {
      return { status: 403, error: 'Forbidden' };
    }

    // Non-admins cannot change role
    if (user.role !== 'admin' && input.role) {
      return { status: 403, error: 'Cannot change role' };
    }

    const updatedUser = await this.userRepo.update(id, input);
    if (!updatedUser) {
      return { status: 404, error: 'User not found' };
    }

    return { status: 200, data: updatedUser };
  }

  /**
   * DELETE /users/:id
   * Delete a user (requires admin)
   */
  async deleteUser(req: ApiRequest): Promise<ApiResponse> {
    const user = await this.authenticate(req);
    if (!user || user.role !== 'admin') {
      return { status: 403, error: 'Forbidden' };
    }

    const { id } = req.params;
    
    // Prevent self-deletion
    if (user.id === id) {
      return { status: 400, error: 'Cannot delete yourself' };
    }

    const deleted = await this.userRepo.delete(id);
    if (!deleted) {
      return { status: 404, error: 'User not found' };
    }

    return { status: 204 };
  }

  private async authenticate(req: ApiRequest): Promise<User | null> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    return validateToken(token);
  }

  private validateCreateInput(input: CreateUserInput): { valid: boolean; error?: string } {
    if (!input.email || !input.email.includes('@')) {
      return { valid: false, error: 'Invalid email' };
    }

    if (!input.password || input.password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters' };
    }

    if (!input.name || input.name.trim().length === 0) {
      return { valid: false, error: 'Name is required' };
    }

    return { valid: true };
  }
}

