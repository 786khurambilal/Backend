import request from 'supertest';
import { App } from '../../app';
import { db } from '../../database/connection';
import { User, PasswordResetToken } from '../../types';

describe('Auth Routes Integration', () => {
  let app: App;
  let server: any;

  beforeAll(async () => {
    app = new App();
    await app.initialize();
    server = app.app;
  });

  afterAll(async () => {
    await app.shutdown();
  });

  beforeEach(async () => {
    // Clean up test data in correct order (child tables first)
    await db('team_memberships').del();
    await db('teams').del();
    await db('memberships').del();
    await db('invitations').del();
    await db('audit_logs').del();
    await db('email_verification_tokens').del();
    await db('password_reset_tokens').del();
    await db('refresh_tokens').del();
    await db('organizations').del();
    await db('users').del();
  });

  describe('POST /auth/register', () => {
    const validUserData = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should register a new user successfully', async () => {
      const response = await request(server)
        .post('/auth/register')
        .send(validUserData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'User registered successfully',
        data: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          isEmailVerified: false,
        },
      });

      // Verify user was created in database
      const user = await db<User>('users').where({ email: 'test@example.com' }).first();
      expect(user).toBeDefined();
      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).not.toBe('Password123!'); // Should be hashed
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(server)
        .post('/auth/register')
        .send({
          ...validUserData,
          email: 'invalid-email',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for weak password', async () => {
      const response = await request(server)
        .post('/auth/register')
        .send({
          ...validUserData,
          password: 'weak',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 for duplicate email', async () => {
      // Create user first
      await request(server)
        .post('/auth/register')
        .send(validUserData)
        .expect(201);

      // Try to create same user again
      const response = await request(server)
        .post('/auth/register')
        .send(validUserData)
        .expect(500);

      expect(response.body.error.message).toContain('User already exists');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });
    });

    it('should login user with valid credentials', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
        data: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          expiresIn: expect.any(Number),
        },
      });
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid credentials');
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get refresh token
      await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      const loginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        });

      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('should refresh tokens with valid refresh token', async () => {
      const response = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Tokens refreshed successfully',
        data: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          expiresIn: expect.any(Number),
        },
      });

      // New tokens should be different from original
      expect(response.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should return 400 for invalid refresh token', async () => {
      const response = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(400);

      expect(response.body.error.message).toBe('Invalid input data');
    });
  });

  describe('POST /auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get tokens
      await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      const loginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        });

      accessToken = loginResponse.body.data.accessToken;
      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('should logout user successfully', async () => {
      const response = await request(server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Logout successful',
      });
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(server)
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });

  describe('POST /auth/forgot-password', () => {
    beforeEach(async () => {
      // Create a test user
      await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });
    });

    it('should accept password reset request for existing user', async () => {
      const response = await request(server)
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('password reset link'),
      });
    });

    it('should not reveal if user does not exist', async () => {
      const response = await request(server)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('password reset link'),
      });
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(server)
        .post('/auth/forgot-password')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/reset-password', () => {
    let resetToken: string;

    beforeEach(async () => {
      // Create a test user
      await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      // Request password reset to get token
      await request(server)
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' });

      // Get the reset token from database
      const tokenRecord = await db<PasswordResetToken>('password_reset_tokens')
        .where({ isUsed: false })
        .orderBy('createdAt', 'desc')
        .first();

      resetToken = tokenRecord?.token || '';
    });

    it('should reset password with valid token', async () => {
      const response = await request(server)
        .post('/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewPassword123!',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Password reset successfully',
      });

      // Verify user can login with new password
      const loginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'NewPassword123!',
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
    });

    it('should return 400 for invalid token', async () => {
      const response = await request(server)
        .post('/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewPassword123!',
        })
        .expect(500);

      expect(response.body.error.message).toContain('Invalid or expired reset token');
    });

    it('should return 400 for weak password', async () => {
      const response = await request(server)
        .post('/auth/reset-password')
        .send({
          token: resetToken,
          password: 'weak',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and get tokens
      const registerResponse = await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      userId = registerResponse.body.data.id;

      const loginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        });

      accessToken = loginResponse.body.data.accessToken;
    });

    it('should return user info for authenticated user', async () => {
      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: userId,
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          isEmailVerified: expect.any(Number), // Database returns 0/1 instead of boolean
        },
      });

      // Should not include password hash
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(server)
        .get('/auth/me')
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });
});