import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { requireAuth, authRateLimit } from '../middleware/auth.middleware';
import { validateRequest, authSchemas } from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { logger } from '../config/logger';

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication and session management endpoints
 */

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user account
 *     description: Creates a new user account with email and password, sends email verification
 *     tags: [Authentication]
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
 *                       $ref: '#/components/schemas/User'
 *                     message:
 *                       type: string
 *                       example: 'User registered successfully'
 *       400:
 *         description: Invalid input data or user already exists
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
      message: 'User registered successfully',
    });
  })
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Sends a password reset email to the user if the email exists
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset email sent (always returns success to prevent user enumeration)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'If an account with that email exists, a password reset link has been sent'
 *       400:
 *         description: Invalid email format
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
      message: 'If an account with that email exists, a password reset link has been sent',
    });
  })
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using token
 *     description: Resets user password using a valid password reset token
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'Password reset successfully'
 *       400:
 *         description: Invalid or expired reset token
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
router.post('/reset-password', 
  authRateLimit, 
  validateRequest({ body: authSchemas.resetPassword }),
  asyncHandler(async (req: Request, res: Response) => {
    await userService.resetPassword(req.body);

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  })
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user with email and password
 *     description: Authenticates a user with email and password, returning JWT access and refresh tokens
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuthTokens'
 *                     message:
 *                       type: string
 *                       example: 'Login successful'
 *       400:
 *         description: Invalid credentials or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many login attempts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', 
  authRateLimit, 
  validateRequest({ body: authSchemas.login }),
  asyncHandler(async (req: Request, res: Response) => {
    const tokens = await authService.login(req.body);

    res.json({
      success: true,
      data: tokens,
      message: 'Login successful',
    });
  })
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token
 *     description: Generates new access and refresh tokens using a valid refresh token
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuthTokens'
 *                     message:
 *                       type: string
 *                       example: 'Tokens refreshed successfully'
 *       400:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many refresh attempts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/refresh', 
  authRateLimit, 
  validateRequest({ body: authSchemas.refreshToken }),
  asyncHandler(async (req: Request, res: Response) => {
    const tokens = await authService.refreshTokens(req.body.refreshToken);

    res.json({
      success: true,
      data: tokens,
      message: 'Tokens refreshed successfully',
    });
  })
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke refresh token (logout)
 *     description: Revokes the provided refresh token, effectively logging out the user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'Logout successful'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Invalid token format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/logout', 
  requireAuth, 
  validateRequest({ body: authSchemas.refreshToken }),
  asyncHandler(async (req: Request, res: Response) => {
    // Extract token ID from refresh token safely
    const tokenParts = req.body.refreshToken.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(
      Buffer.from(tokenParts[1] || '', 'base64').toString()
    );

    if (payload.tokenId) {
      await authService.revokeRefreshToken(payload.tokenId);
    }

    logger.info({ userId: req.userId }, 'User logged out');

    res.json({
      success: true,
      message: 'Logout successful',
    });
  })
);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     summary: Revoke all refresh tokens for the user
 *     description: Revokes all refresh tokens for the authenticated user, logging them out from all devices
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: All sessions logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'All sessions logged out successfully'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/logout-all', 
  requireAuth, 
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    await authService.revokeAllRefreshTokens(req.userId);

    logger.info({ userId: req.userId }, 'All user sessions revoked');

    res.json({
      success: true,
      message: 'All sessions logged out successfully',
    });
  })
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user information
 *     description: Returns the authenticated user's profile information
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', 
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

export { router as authRoutes };