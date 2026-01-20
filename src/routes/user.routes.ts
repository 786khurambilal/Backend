import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { userService } from '../services/user.service';
import { authService } from '../services/auth.service';
import { requireAuth, authRateLimit } from '../middleware/auth.middleware';
import { validateRequest, authSchemas, commonSchemas } from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { logger } from '../config/logger';

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and profile endpoints
 */

const router = Router();

/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Register a new user account
 *     description: Creates a new user account and returns authentication tokens for immediate login
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *                         tokens:
 *                           $ref: '#/components/schemas/AuthTokens'
 *                     message:
 *                       type: string
 *                       example: 'User registered successfully. Please check your email to verify your account.'
 *       400:
 *         description: Validation error or email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many registration attempts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', 
  authRateLimit, 
  validateRequest({ body: authSchemas.register }),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.registerUser(req.body);

    // Remove sensitive data from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    const { passwordHash, ...userResponse } = user;

    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'User registered successfully. Please wait for an organization invitation to access the system.',
    });
  })
);

/**
 * @swagger
 * /users/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Sends a password reset email to the user if the email exists (prevents user enumeration)
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset email sent (or would be sent if email exists)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'If an account with that email exists, a password reset link has been sent.'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many password reset attempts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/forgot-password', 
  authRateLimit, 
  validateRequest({ body: authSchemas.forgotPassword }),
  asyncHandler(async (req: Request, res: Response) => {
    await userService.requestPasswordReset(req.body.email);

    // Always return success to prevent user enumeration
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  })
);

/**
 * POST /users/reset-password
 * Reset password using token
 */
router.post('/reset-password', 
  authRateLimit, 
  validateRequest({ body: authSchemas.resetPassword }),
  asyncHandler(async (req: Request, res: Response) => {
    await userService.resetPassword(req.body);

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  })
);

/**
 * POST /users/verify-email
 * Verify email address using token
 */
router.post('/verify-email', 
  validateRequest({ 
    body: z.object({
      token: commonSchemas.token
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    await userService.verifyEmail(req.body);

    res.json({
      success: true,
      message: 'Email verified successfully.',
    });
  })
);

/**
 * POST /users/resend-verification
 * Resend email verification
 */
router.post('/resend-verification', 
  requireAuth,
  authRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    await userService.resendEmailVerification(req.userId);

    res.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  })
);

/**
 * GET /users/profile
 * Get current user profile
 */
router.get('/profile', 
  requireAuth, 
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new Error('Authentication required');
    }

    // Return user info without sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    const { passwordHash, ...userInfo } = req.user;

    res.json({
      success: true,
      data: userInfo,
    });
  })
);

/**
 * PUT /users/profile
 * Update user profile
 */
router.put('/profile', 
  requireAuth, 
  validateRequest({ 
    body: authSchemas.register.pick({ 
      firstName: true, 
      lastName: true 
    }).partial() 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    const updatedUser = await userService.updateUserProfile(req.userId, req.body);

    // Return user info without sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    const { passwordHash, ...userInfo } = updatedUser;

    res.json({
      success: true,
      data: userInfo,
      message: 'Profile updated successfully.',
    });
  })
);

/**
 * POST /users/change-password
 * Change user password
 */
router.post('/change-password', 
  requireAuth, 
  validateRequest({ body: authSchemas.changePassword }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId || !req.user) {
      throw new Error('Authentication required');
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isValidPassword = await authService.verifyPassword(
      currentPassword, 
      req.user.passwordHash
    );

    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await authService.hashPassword(newPassword);

    // Update password
    await userService.updateUserProfile(req.userId, {
      passwordHash: newPasswordHash,
    });

    logger.info({ userId: req.userId }, 'Password changed successfully');

    res.json({
      success: true,
      message: 'Password changed successfully.',
    });
  })
);

export { router as userRoutes };