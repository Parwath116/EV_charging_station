import { authService } from '../services/auth.service.js';
import { env } from '../config/env.js';

const COOKIE_NAME = 'voltgrid_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export class AuthController {
  async register(req, res, next) {
    try {
      const { user, token } = await authService.register(req.body);

      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      res.status(201).json({
        success: true,
        data: { ...user, token },
        message: 'Account registered successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { user, token } = await authService.login(req.body);

      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      res.status(200).json({
        success: true,
        data: { ...user, token },
        message: 'Login successful',
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      const user = await authService.getCurrentUser(req.user._id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const result = await authService.changePassword(req.user._id, req.body);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
