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
}

export interface TokenPayload {
  userId: string;
  email: string;
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
   * Authenticate user with email and password, return JWT tokens
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const { email, password } = credentials;

    // Find user by email
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

    // Generate tokens
    const tokens = await this.generateTokens(user);

    logger.info({ userId: user.id, email: user.email }, 'User logged in successfully');

    return tokens;
  }

  /**
   * Generate new access and refresh tokens for a user
   */
  async generateTokens(user: User): Promise<AuthTokens> {
    // Generate access token
    const accessTokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
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

      // Revoke old refresh token (token rotation)
      await this.revokeRefreshToken(payload.tokenId);

      // Generate new tokens
      const newTokens = await this.generateTokens(user);

      logger.info({ userId: user.id }, 'Tokens refreshed successfully');

      return newTokens;
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