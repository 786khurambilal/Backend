import request from 'supertest';
import { App } from '../../app';
import { db } from '../../database/connection';

describe('Audit Routes Integration', () => {
  let app: App;
  let server: any;
  let userToken: string;
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

    // Create user and organization
    const registerResponse = await request(server)
      .post('/auth/register')
      .send({
        email: 'user@example.com',
        password: 'UserPassword123!',
        firstName: 'Test',
        lastName: 'User',
      });

    const loginResponse = await request(server)
      .post('/auth/login')
      .send({
        email: 'user@example.com',
        password: 'UserPassword123!',
      });

    userToken = loginResponse.body.data.accessToken;

    // Create organization
    const orgResponse = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Test Organization',
        slug: 'test-org',
      });

    organizationId = orgResponse.body.data.id;
  });

  describe('GET /organizations/:orgId/audit-logs', () => {
    it('should return audit logs for organization member', async () => {
      const response = await request(server)
        .get(`/organizations/${organizationId}/audit-logs`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
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

    it('should support filtering by action', async () => {
      const response = await request(server)
        .get(`/organizations/${organizationId}/audit-logs?action=CREATE_ORGANIZATION`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.any(Array));
    });

    it('should support filtering by entity type', async () => {
      const response = await request(server)
        .get(`/organizations/${organizationId}/audit-logs?entityType=Organization`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.any(Array));
    });

    it('should support pagination', async () => {
      const response = await request(server)
        .get(`/organizations/${organizationId}/audit-logs?page=1&limit=10`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
      });
    });

    it('should support date filtering', async () => {
      const startDate = new Date().toISOString();
      const response = await request(server)
        .get(`/organizations/${organizationId}/audit-logs?startDate=${startDate}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.any(Array));
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(server)
        .get(`/organizations/${organizationId}/audit-logs`)
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    it('should return 403 for non-member access', async () => {
      // Create another user
      await request(server)
        .post('/auth/register')
        .send({
          email: 'other@example.com',
          password: 'OtherPassword123!',
          firstName: 'Other',
          lastName: 'User',
        });

      const otherLoginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: 'other@example.com',
          password: 'OtherPassword123!',
        });

      const otherToken = otherLoginResponse.body.data.accessToken;

      const response = await request(server)
        .get(`/organizations/${organizationId}/audit-logs`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should return 400 for invalid organization ID', async () => {
      const response = await request(server)
        .get('/organizations/invalid-uuid/audit-logs')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});