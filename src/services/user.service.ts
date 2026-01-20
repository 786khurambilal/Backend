import { randomBytes } from 'crypto';
import { db } from '../database/connection';
import { authService } from './auth.service';
import { emailService } from './email.service';
import { logger } from '../config/logger';
import { User, CreateUserData } from '../types';

export interface RegisterUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface UpdateUserProfileData {
  firstName?: string;
  lastName?: string;
  passwordHash?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetData {
  token: string;
  password: string;
}

export interface EmailVerificationData {
  token: string;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export interface EmailVerificationToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export class UserService {
  /**
   * Convert database user record to User type with proper boolean conversion
   */
  private convertDatabaseUser(dbUser: any): User {
    return {
      ...dbUser,
      isEmailVerified: Boolean(dbUser.isEmailVerified),
      createdAt: new Date(dbUser.createdAt),
      updatedAt: new Date(dbUser.updatedAt),
    };
  }

  /**
   * Register a new user
   */
  async registerUser(userData: RegisterUserData): Promise<User> {
    const { email, password, firstName, lastName } = userData;

    // Check if user already exists
    const existingUser = await db<User>('users')
      .where({ email })
      .first();

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const passwordHash = await authService.hashPassword(password);

    // Create user data (let database generate UUID)
    const createUserData: CreateUserData = {
      email,
      passwordHash,
      firstName,
      lastName,
      isEmailVerified: false,
    };

    // Insert user into database first (let database generate UUID)
    await db('users').insert({
      ...createUserData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Fetch the created user to ensure it exists
    const dbUser = await db('users')
      .where({ email })
      .first();

    if (!dbUser) {
      throw new Error('Failed to create user');
    }

    const newUser = this.convertDatabaseUser(dbUser);

    // Generate email verification token after user is confirmed to exist
    let verificationToken: string;
    try {
      // Double-check that user exists in database before creating token
      const userExists = await db('users').where({ id: newUser.id }).first();
      if (!userExists) {
        throw new Error('User not found in database');
      }
      
      verificationToken = await this.generateEmailVerificationToken(newUser.id);
    } catch (error) {
      // If token creation fails, log but don't fail registration
      logger.warn(
        { userId: newUser.id, email: newUser.email, error }, 
        'Failed to create email verification token'
      );
      verificationToken = ''; // Set empty token to avoid undefined
    }

    // Send email verification email (only if token was created successfully)
    if (verificationToken) {
      try {
        await emailService.sendEmailVerificationEmail(newUser.email, verificationToken);
      } catch (error) {
        logger.warn(
          { userId: newUser.id, email: newUser.email, error }, 
          'Failed to send email verification email'
        );
        // Don't fail registration if email fails
      }
    }

    logger.info({ userId: newUser.id, email: newUser.email }, 'User registered successfully');

    return newUser;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const dbUser = await db<User>('users')
      .where({ id: userId })
      .first();

    return dbUser ? this.convertDatabaseUser(dbUser) : null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const dbUser = await db<User>('users')
      .where({ email })
      .first();

    return dbUser ? this.convertDatabaseUser(dbUser) : null;
  }

  /**
   * Get all organizations that a user belongs to
   */
  async getUserOrganizations(userId: string): Promise<Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
    status: string;
    joinedAt: Date | null;
  }>> {
    const memberships = await db('memberships')
      .join('organizations', 'memberships.organizationId', 'organizations.id')
      .where('memberships.userId', userId)
      .where('memberships.status', 'ACTIVE')
      .select(
        'memberships.organizationId',
        'organizations.name as organizationName',
        'organizations.slug as organizationSlug',
        'memberships.role',
        'memberships.status',
        'memberships.joinedAt'
      );

    return memberships.map(membership => ({
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      organizationSlug: membership.organizationSlug,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt ? new Date(membership.joinedAt) : null,
    }));
  }

  /**
   * Get user organizations by email (for login organization selection)
   */
  async getUserOrganizationsByEmail(email: string): Promise<Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
  }>> {
    const user = await this.getUserByEmail(email);
    if (!user) {
      return [];
    }

    return await this.getUserOrganizations(user.id);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updateData: UpdateUserProfileData): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update user
    await db<User>('users')
      .where({ id: userId })
      .update({
        ...updateData,
        updatedAt: new Date(),
      });

    // Fetch updated user
    const updatedUser = await this.getUserById(userId);
    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    logger.info({ userId }, 'User profile updated successfully');

    return updatedUser;
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    // Always return success to prevent user enumeration
    const user = await this.getUserByEmail(email);
    
    if (user) {
      // Generate password reset token
      const token = await this.generatePasswordResetToken(user.id);
      
      // Send password reset email
      try {
        await emailService.sendPasswordResetEmail(user.email, token);
        logger.info({ userId: user.id, email }, 'Password reset email sent');
      } catch (error) {
        logger.error(
          { userId: user.id, email, error }, 
          'Failed to send password reset email'
        );
        // Don't reveal email failure to prevent user enumeration
      }
    } else {
      // Log attempt but don't reveal user doesn't exist
      logger.info({ email }, 'Password reset requested for non-existent user');
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(resetData: PasswordResetData): Promise<void> {
    const { token, password } = resetData;

    // Find valid password reset token
    const resetToken = await db<PasswordResetToken>('password_reset_tokens')
      .where({
        token,
        isUsed: false,
      })
      .where('expiresAt', '>', new Date())
      .first();

    if (!resetToken) {
      throw new Error('Invalid or expired reset token');
    }

    // Get user
    const user = await this.getUserById(resetToken.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Hash new password
    const passwordHash = await authService.hashPassword(password);

    // Update password and mark token as used
    await db.transaction(async (trx) => {
      // Update user password
      await trx<User>('users')
        .where({ id: user.id })
        .update({
          passwordHash,
          updatedAt: new Date(),
        });

      // Mark token as used
      await trx<PasswordResetToken>('password_reset_tokens')
        .where({ id: resetToken.id })
        .update({
          isUsed: true,
        });
    });

    logger.info({ userId: user.id }, 'Password reset successfully');
  }

  /**
   * Verify email using token
   */
  async verifyEmail(verificationData: EmailVerificationData): Promise<void> {
    const { token } = verificationData;

    // Find valid email verification token
    const verificationToken = await db<EmailVerificationToken>('email_verification_tokens')
      .where({
        token,
        isUsed: false,
      })
      .where('expiresAt', '>', new Date())
      .first();

    if (!verificationToken) {
      throw new Error('Invalid or expired verification token');
    }

    // Get user
    const user = await this.getUserById(verificationToken.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update user email verification status and mark token as used
    await db.transaction(async (trx) => {
      // Update user email verification status
      await trx<User>('users')
        .where({ id: user.id })
        .update({
          isEmailVerified: true,
          updatedAt: new Date(),
        });

      // Mark token as used
      await trx<EmailVerificationToken>('email_verification_tokens')
        .where({ id: verificationToken.id })
        .update({
          isUsed: true,
        });
    });

    logger.info({ userId: user.id }, 'Email verified successfully');
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.isEmailVerified) {
      throw new Error('Email is already verified');
    }

    // Generate new email verification token
    const verificationToken = await this.generateEmailVerificationToken(userId);

    // Send email verification email
    try {
      await emailService.sendEmailVerificationEmail(user.email, verificationToken);
    } catch (error) {
      logger.warn(
        { userId, email: user.email, error }, 
        'Failed to send email verification email'
      );
      throw new Error('Failed to send verification email');
    }

    logger.info({ userId }, 'Email verification resent');
  }

  /**
   * Generate password reset token
   */
  private async generatePasswordResetToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 60 * 60 * 1000); // 1 hour

    await db<PasswordResetToken>('password_reset_tokens').insert({
      userId,
      token,
      expiresAt,
      isUsed: false,
      createdAt: new Date(),
    });

    return token;
  }

  /**
   * Generate email verification token
   */
  private async generateEmailVerificationToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    await db<EmailVerificationToken>('email_verification_tokens').insert({
      userId,
      token,
      expiresAt,
      isUsed: false,
      createdAt: new Date(),
    });

    return token;
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();

    // Clean up expired password reset tokens
    const deletedPasswordTokens = await db<PasswordResetToken>('password_reset_tokens')
      .where('expiresAt', '<', now)
      .del();

    // Clean up expired email verification tokens
    const deletedEmailTokens = await db<EmailVerificationToken>('email_verification_tokens')
      .where('expiresAt', '<', now)
      .del();

    if (deletedPasswordTokens > 0 || deletedEmailTokens > 0) {
      logger.info(
        { 
          deletedPasswordTokens, 
          deletedEmailTokens 
        }, 
        'Cleaned up expired user tokens'
      );
    }
  }
}

// Export singleton instance
export const userService = new UserService();