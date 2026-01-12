import request from 'supertest';
import { App } from '../../app';
import { db } from '../../database/connection';

describe('Team Routes Integration', () => {
  let app: App;
  let server: any;
  let authToken: string;
  let organizationId: string;
  let userId: string;

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
    await db('audit_logs').del();
    await db('memberships').del();
    await db('invitations').del();
    await db('organizations').del();
    await db('refresh_tokens').del();
    await db('users').del();

    // Create test user and organization
    const registerResponse = await request(server)
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123',
        firstName: 'Test',
        lastName: 'User',
      });

    expect(registerResponse.status).toBe(201);
    userId = registerResponse.body.data.id;

    const loginResponse = await request(server)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123',
      });

    expect(loginResponse.status).toBe(200);
    authToken = loginResponse.body.data.accessToken;

    const orgResponse = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test Organization',
        description: 'Test organization for team tests',
      });

    expect(orgResponse.status).toBe(201);
    organizationId = orgResponse.body.data.id;
  });

  describe('POST /organizations/:orgId/teams', () => {
    it('should create a new team successfully', async () => {
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const response = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: teamData.name,
        description: teamData.description,
        organizationId,
        createdBy: userId,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.message).toBe('Team created successfully');
    });

    it('should reject team creation without authentication', async () => {
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const response = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .send(teamData);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /organizations/:orgId/teams', () => {
    it('should return organization teams', async () => {
      // Create a test team first
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const createResponse = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(createResponse.status).toBe(201);

      // Get teams
      const response = await request(server)
        .get(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        name: teamData.name,
        description: teamData.description,
        organizationId,
      });
      expect(response.body.pagination).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(server)
        .get(`/organizations/${organizationId}/teams`);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /organizations/:orgId/teams/:teamId', () => {
    it('should return team details', async () => {
      // Create a test team first
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const createResponse = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(createResponse.status).toBe(201);
      const teamId = createResponse.body.data.id;

      // Get team details
      const response = await request(server)
        .get(`/organizations/${organizationId}/teams/${teamId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: teamId,
        name: teamData.name,
        description: teamData.description,
        organizationId,
      });
    });
  });

  describe('PUT /organizations/:orgId/teams/:teamId', () => {
    it('should update team successfully', async () => {
      // Create a test team first
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const createResponse = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(createResponse.status).toBe(201);
      const teamId = createResponse.body.data.id;

      // Update team
      const updateData = {
        name: 'Updated Development Team',
        description: 'Updated description',
      };

      const response = await request(server)
        .put(`/organizations/${organizationId}/teams/${teamId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: teamId,
        name: updateData.name,
        description: updateData.description,
        organizationId,
      });
      expect(response.body.message).toBe('Team updated successfully');
    });
  });

  describe('DELETE /organizations/:orgId/teams/:teamId', () => {
    it('should delete team successfully', async () => {
      // Create a test team first
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const createResponse = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(createResponse.status).toBe(201);
      const teamId = createResponse.body.data.id;

      // Delete team
      const response = await request(server)
        .delete(`/organizations/${organizationId}/teams/${teamId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Team deleted successfully');

      // Verify team is deleted
      const getResponse = await request(server)
        .get(`/organizations/${organizationId}/teams/${teamId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(500); // Team not found
    });
  });

  describe('POST /organizations/:orgId/teams/:teamId/members', () => {
    it('should add team member successfully', async () => {
      // Create a test team first
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const createResponse = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(createResponse.status).toBe(201);
      const teamId = createResponse.body.data.id;

      // Add team member (the user is already a member of the organization)
      const response = await request(server)
        .post(`/organizations/${organizationId}/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        teamId,
        userId,
        addedBy: userId,
      });
      expect(response.body.message).toBe('Member added to team successfully');
    });
  });

  describe('GET /organizations/:orgId/teams/:teamId/members', () => {
    it('should return team members', async () => {
      // Create a test team first
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const createResponse = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(createResponse.status).toBe(201);
      const teamId = createResponse.body.data.id;

      // Add team member
      await request(server)
        .post(`/organizations/${organizationId}/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId });

      // Get team members
      const response = await request(server)
        .get(`/organizations/${organizationId}/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        userId,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe('DELETE /organizations/:orgId/teams/:teamId/members/:userId', () => {
    it('should remove team member successfully', async () => {
      // Create a test team first
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const createResponse = await request(server)
        .post(`/organizations/${organizationId}/teams`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(teamData);

      expect(createResponse.status).toBe(201);
      const teamId = createResponse.body.data.id;

      // Add team member
      await request(server)
        .post(`/organizations/${organizationId}/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId });

      // Remove team member
      const response = await request(server)
        .delete(`/organizations/${organizationId}/teams/${teamId}/members/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Member removed from team successfully');

      // Verify member is removed
      const membersResponse = await request(server)
        .get(`/organizations/${organizationId}/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(membersResponse.status).toBe(200);
      expect(membersResponse.body.data).toHaveLength(0);
    });
  });
});