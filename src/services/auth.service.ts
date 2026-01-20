import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../database/connection';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AuthTokens, User, RefreshToken } from '../types';
import { AuthenticationError } from '../middleware/error.middleware';

export interface LoginCredentials {
  email: string;
  password: string;
  organizationId: string; // Required - user must select organization
}

export interface TokenPayload {
  userId: string;
  email: string;
  organizationId: string; // Required - always includes organization context
  role: string; // User's role in the selected organization
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

export class AuthService {
  /**
   * Authenticate user with email, password, and organization selection
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const { email, password, organizationId } = credentials;

    // Find user by email (global lookup)
    const user = await db<User>('users')
      .where({ email })
      .first();

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Check if user has membership in the selected organization
    const membership = await db('memberships')
      .where({
        userId: user.id,
        organizationId: organizationId,
        status: 'ACTIVE'
      })
      .first();

    if (!membership) {
      throw new AuthenticationError('User does not have access to this organization');
    }

    // Generate tokens with organization context and role
    const tokens = await this.generateTokens(user, organizationId, membership.role);

    logger.info({ 
      userId: user.id, 
      email: user.email, 
      organizationId,
      role: membership.role 
    }, 'User logged in successfully');

    return tokens;
  }

  /**
   * Generate new access and refresh tokens for a user with organization context
   */
  async generateTokens(user: User, organizationId: string, role: string): Promise<AuthTokens> {
    // Generate access token with organization and role context
    const accessTokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      organizationId,
      role,
    };

    const accessToken = jwt.sign(
      accessTokenPayload,
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    );

    // Generate refresh token (let database generate UUID for token ID)
    const refreshTokenPayload: RefreshTokenPayload = {
      userId: user.id,
      tokenId: 'temp', // Will be replaced with actual UUID after insertion
    };

    const refreshToken = jwt.sign(
      refreshTokenPayload,
      env.REFRESH_TOKEN_SECRET,
      { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions
    );

    // Hash and store refresh token
    const refreshTokenHash = await this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + this.parseExpirationTime(env.REFRESH_TOKEN_EXPIRES_IN));

    await db<RefreshToken>('refresh_tokens').insert({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      isRevoked: false,
      createdAt: new Date(),
    });

    // Get the actual token ID from the database
    const tokenRecord = await db<RefreshToken>('refresh_tokens')
      .where({ tokenHash: refreshTokenHash })
      .first();

    if (!tokenRecord) {
      throw new Error('Failed to create refresh token');
    }

    // Generate the actual refresh token with the correct token ID
    const actualRefreshTokenPayload: RefreshTokenPayload = {
      userId: user.id,
      tokenId: tokenRecord.id,
    };

    const actualRefreshToken = jwt.sign(
      actualRefreshTokenPayload,
      env.REFRESH_TOKEN_SECRET,
      { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions
    );

    // Parse expiration time for response
    const expiresIn = this.parseExpirationTime(env.JWT_EXPIRES_IN);

    return {
      accessToken,
      refreshToken: actualRefreshToken,
      expiresIn: Math.floor(expiresIn / 1000), // Convert to seconds
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET) as RefreshTokenPayload;

      // Check if refresh token exists and is not revoked
      const storedToken = await db<RefreshToken>('refresh_tokens')
        .where({
          id: payload.tokenId,
          userId: payload.userId,
          isRevoked: false,
        })
        .where('expiresAt', '>', new Date())
        .first();

      if (!storedToken) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Verify token hash
      const isValidToken = await this.verifyToken(refreshToken, storedToken.tokenHash);
      if (!isValidToken) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Get user
      const user = await db<User>('users')
        .where({ id: payload.userId })
        .first();

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Get organization context from the stored token metadata
      // For now, we'll require the client to re-login to select organization
      // In a production system, you might store organization context with the refresh token
      throw new AuthenticationError('Token refresh requires re-authentication with organization selection');

    } catch (error) {
      logger.error({ error }, 'Failed to refresh tokens');
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeRefreshToken(tokenId: string): Promise<void> {
    await db<RefreshToken>('refresh_tokens')
      .where({ id: tokenId })
      .update({
        isRevoked: true,
        updatedAt: new Date(),
      });

    logger.info({ tokenId }, 'Refresh token revoked');
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await db<RefreshToken>('refresh_tokens')
      .where({ userId })
      .update({
        isRevoked: true,
        updatedAt: new Date(),
      });

    logger.info({ userId }, 'All refresh tokens revoked for user');
  }

  /**
   * Verify JWT access token
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      return payload;
    } catch (error) {
      logger.debug({ error }, 'Access token verification failed');
      throw new AuthenticationError('Invalid access token');
    }
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = env.BCRYPT_ROUNDS;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Hash token for storage
   */
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10); // Use lower rounds for tokens as they're already random
  }

  /**
   * Verify token against hash
   */
  private async verifyToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  /**
   * Parse expiration time string to milliseconds
   */
  private parseExpirationTime(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid expiration time format: ${expiresIn}`);
    }
  }

  /**
   * Clean up expired refresh tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    const deletedCount = await db<RefreshToken>('refresh_tokens')
      .where('expiresAt', '<', new Date())
      .del();

    if (deletedCount > 0) {
      logger.info({ deletedCount }, 'Cleaned up expired refresh tokens');
    }
  }
}

// Export singleton instance
export const authService = new AuthService();