import request from 'supertest';
import { App } from '../../app';
import { db } from '../../database/connection';

describe('Admin Routes Integration', () => {
  let app: App;
  let server: any;
  let adminToken: string;
  let adminUserId: string;
  let organizationId: string;

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
    await db('debug_routes').del();
    await db('error_logs').del();
    await db('organizations').del();
    await db('users').del();

    // Create admin user and organization
    const registerResponse = await request(server)
      .post('/auth/register')
      .send({
        email: 'admin@example.com',
        password: 'AdminPassword123!',
        firstName: 'Admin',
        lastName: 'User',
      });

    adminUserId = registerResponse.body.data.id;

    const loginResponse = await request(server)
      .post('/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'AdminPassword123!',
      });

    adminToken = loginResponse.body.data.accessToken;

    // Create organization
    const orgResponse = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Organization',
        slug: 'test-org',
      });

    organizationId = orgResponse.body.data.id;
  });

  describe('GET /admin/debug-routes', () => {
    it('should return debug routes for authenticated admin', async () => {
      const response = await request(server)
        .get('/admin/debug-routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: expect.any(Array),
        total: expect.any(Number),
      });
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(server)
        .get('/admin/debug-routes')
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });

  describe('POST /admin/debug-routes', () => {
    it('should create debug route for authenticated admin', async () => {
      const response = await request(server)
        .post('/admin/debug-routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          routePattern: '/api/test/*',
          enabled: true,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        data: {
          routePattern: '/api/test/*',
          enabled: true,
          createdBy: adminUserId,
        },
        message: 'Debug route configuration created successfully',
      });
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(server)
        .post('/admin/debug-routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          routePattern: '', // Invalid empty pattern
          enabled: true,
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /admin/debug-routes/:id', () => {
    let debugRouteId: string;

    beforeEach(async () => {
      const response = await request(server)
        .post('/admin/debug-routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          routePattern: '/api/test/*',
          enabled: true,
        });

      debugRouteId = response.body.data.id;
    });

    it('should delete debug route for authenticated admin', async () => {
      const response = await request(server)
        .delete(`/admin/debug-routes/${debugRouteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Debug route configuration deleted successfully',
      });
    });

    it('should return 404 for non-existent debug route', async () => {
      const response = await request(server)
        .delete('/admin/debug-routes/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  describe('GET /admin/error-logs', () => {
    it('should return error logs for authenticated admin', async () => {
      const response = await request(server)
        .get('/admin/error-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: expect.any(Array),
        pagination: {
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
          totalPages: expect.any(Number),
          hasNext: expect.any(Boolean),
          hasPrev: expect.any(Boolean),
        },
      });
    });

    it('should support filtering by organization', async () => {
      const response = await request(server)
        .get(`/admin/error-logs?organizationId=${organizationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toEqual(expect.any(Array));
    });

    it('should support pagination', async () => {
      const response = await request(server)
        .get('/admin/error-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
      });
    });
  });
});