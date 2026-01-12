import request from 'supertest';
import { App } from '../../app';
import { db } from '../../database/connection';
import { User } from '../../types';

describe('User Routes Integration', () => {
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

  describe('POST /users/register', () => {
    const validUserData = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should register a new user successfully', async () => {
      const response = await request(server)
        .post('/users/register')
        .send(validUserData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('registered successfully'),
        data: {
          user: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            isEmailVerified: false,
          },
          tokens: {
            accessToken: expect.any(String),
            refreshToken: expect.any(String),
            expiresIn: expect.any(Number),
          },
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
        .post('/users/register')
        .send({
          ...validUserData,
          email: 'invalid-email',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for weak password', async () => {
      const response = await request(server)
        .post('/users/register')
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
        .post('/users/register')
        .send(validUserData)
        .expect(201);

      // Try to create same user again
      const response = await request(server)
        .post('/users/register')
        .send(validUserData)
        .expect(500);

      expect(response.body.error.message).toContain('User already exists');
    });
  });

  describe('POST /users/forgot-password', () => {
    beforeEach(async () => {
      // Create a test user
      await request(server)
        .post('/users/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });
    });

    it('should accept password reset request for existing user', async () => {
      const response = await request(server)
        .post('/users/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('password reset link'),
      });
    });

    it('should not reveal if user does not exist', async () => {
      const response = await request(server)
        .post('/users/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('password reset link'),
      });
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(server)
        .post('/users/forgot-password')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /users/profile', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and get tokens
      const registerResponse = await request(server)
        .post('/users/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      accessToken = registerResponse.body.data.tokens.accessToken;
      userId = registerResponse.body.data.user.id;
    });

    it('should return user profile for authenticated user', async () => {
      const response = await request(server)
        .get('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: userId,
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          isEmailVerified: false,
        },
      });

      // Should not include password hash
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(server)
        .get('/users/profile')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(server)
        .get('/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /users/profile', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and get tokens
      const registerResponse = await request(server)
        .post('/users/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      accessToken = registerResponse.body.data.tokens.accessToken;
    });

    it('should update user profile successfully', async () => {
      const updateData = {
        firstName: 'Jane',
        lastName: 'Smith',
      };

      const response = await request(server)
        .put('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Profile updated successfully.',
        data: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'test@example.com',
        },
      });
    });

    it('should return 400 for invalid name format', async () => {
      const response = await request(server)
        .put('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'John123', // Invalid characters
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(server)
        .put('/users/profile')
        .send({
          firstName: 'Jane',
        })
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});