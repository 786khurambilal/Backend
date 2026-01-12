import request from 'supertest';
import { App } from '../../app';
import { db } from '../../database/connection';
import { Organization, Role } from '../../types';

describe('Organization Routes Integration', () => {
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

  describe('POST /organizations', () => {
    const validOrgData = {
      name: 'Test Organization',
      slug: 'test-org',
      description: 'A test organization',
      settings: {
        allowPublicSignup: false,
        defaultRole: Role.MEMBER,
      },
    };

    it('should create a new organization successfully', async () => {
      // First register a user
      await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(201);

      // Login to get tokens
      const loginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const { accessToken } = loginResponse.body.data;

      // Create organization
      const response = await request(server)
        .post('/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validOrgData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Organization created successfully',
        data: {
          name: validOrgData.name,
          slug: validOrgData.slug,
        },
      });

      // Verify organization was created in database
      const org = await db<Organization>('organizations')
        .where({ slug: validOrgData.slug })
        .first();
      expect(org).toBeDefined();
      expect(org!.name).toBe(validOrgData.name);
    });

    it('should reject organization creation without authentication', async () => {
      const response = await request(server)
        .post('/organizations')
        .send(validOrgData)
        .expect(401);

      expect(response.body).toMatchObject({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required',
        },
      });
    });
  });

  describe('GET /organizations', () => {
    it('should return user organizations', async () => {
      // First register a user
      await request(server)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(201);

      // Login to get tokens
      const loginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const { accessToken } = loginResponse.body.data;

      // Create an organization
      await request(server)
        .post('/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Organization',
          slug: 'test-org',
        })
        .expect(201);

      // Get user organizations
      const response = await request(server)
        .get('/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            name: 'Test Organization',
            slug: 'test-org',
          }),
        ]),
      });
    });

    it('should require authentication', async () => {
      const response = await request(server)
        .get('/organizations')
        .expect(401);

      expect(response.body).toMatchObject({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required',
        },
      });
    });
  });
});