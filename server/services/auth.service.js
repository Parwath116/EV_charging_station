import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { userRepository } from '../repositories/user.repository.js';
import {
  UnauthorizedError,
  ConflictError,
  BadRequestError,
  NotFoundError,
} from '../utils/errors.js';

export class AuthService {
  /**
   * Generates a signed JWT authentication token
   */
  generateToken(user) {
    return jwt.sign(
      {
        id: String(user._id),
        email: user.email,
        role: user.role,
        name: user.name,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  }

  /**
   * Registers a new user account
   */
  async register({ name, email, password, role = 'driver', vehicles = [] }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('An account with this email address is already registered');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await userRepository.create({
      name,
      email,
      passwordHash,
      role,
      walletBalance: role === 'driver' ? 500 : 0, // 500 INR initial credit for drivers
      vehicles,
      createdAt: new Date(),
    });

    const token = this.generateToken(newUser);
    const { passwordHash: _, ...safeUser } = newUser;

    return { user: safeUser, token };
  }

  /**
   * Authenticates user with email and password
   */
  async login({ email, password }) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password credentials');
    }

    // Update last login timestamp asynchronously
    userRepository.updateLastLogin(user._id).catch(() => {});

    const token = this.generateToken(user);
    const { passwordHash: _, ...safeUser } = user;

    return { user: safeUser, token };
  }

  /**
   * Retrieves profile for currently authenticated user
   */
  async getCurrentUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Changes user password
   */
  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestError('Current password provided is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await userRepository.updatePassword(userId, newHash);
    return { success: true, message: 'Password updated successfully' };
  }
}

export const authService = new AuthService();
