import { dataAccessService } from '../data-access.service';
import { accessControlService } from '../access-control.service';
import { db } from '../../database/connection';
import { Role, MembershipStatus } from '../../types';

describe('DataAccessService', () => {
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

  describe('Organization-scoped queries', () => {
    it('should create organization-scoped query builder', () => {
      const orgId = 'test-org-123';
      const query = dataAccessService.createOrganizationScopedQuery('teams', orgId);
      
      const sql = query.toSQL();
      expect(sql.sql).toContain('organization_id');
      expect(sql.bindings).toContain(orgId);
    });

    it('should validate record ownership correctly', async () => {
      // Create test data
      const userId = 'user-123';
      const orgId1 = 'org-123';
      const orgId2 = 'org-456';
      const teamId = 'team-123';

      // Create user first (required for foreign key)
      await db('users').insert({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create organizations
      await db('organizations').insert([
        {
          id: orgId1,
          name: 'Test Org 1',
          slug: 'test-org-1',
          ownerId: userId,
          settings: JSON.stringify({ allowPublicSignup: false, defaultRole: 'MEMBER' }),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: orgId2,
          name: 'Test Org 2',
          slug: 'test-org-2',
          ownerId: userId,
          settings: JSON.stringify({ allowPublicSignup: false, defaultRole: 'MEMBER' }),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Create team in org1
      await db('teams').insert({
        id: teamId,
        organizationId: orgId1,
        name: 'Test Team',
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Test valid ownership
      const validRecord = await dataAccessService.validateRecordOwnership(
        'teams',
        teamId,
        orgId1
      );
      expect(validRecord).toBeTruthy();
      expect((validRecord as any)?.id).toBe(teamId);

      // Test invalid ownership (team belongs to org1, not org2)
      const invalidRecord = await dataAccessService.validateRecordOwnership(
        'teams',
        teamId,
        orgId2
      );
      expect(invalidRecord).toBeNull();
    });

    it('should count organization records correctly', async () => {
      const orgId1 = 'org-123';
      const orgId2 = 'org-456';
      const userId = 'user-123';

      // Create user first (required for foreign key)
      await db('users').insert({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create organizations
      await db('organizations').insert([
        {
          id: orgId1,
          name: 'Test Org 1',
          slug: 'test-org-1',
          ownerId: userId,
          settings: JSON.stringify({ allowPublicSignup: false, defaultRole: 'MEMBER' }),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: orgId2,
          name: 'Test Org 2',
          slug: 'test-org-2',
          ownerId: userId,
          settings: JSON.stringify({ allowPublicSignup: false, defaultRole: 'MEMBER' }),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Create teams in different organizations
      await db('teams').insert([
        {
          id: 'team-1',
          organizationId: orgId1,
          name: 'Team 1',
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'team-2',
          organizationId: orgId1,
          name: 'Team 2',
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'team-3',
          organizationId: orgId2,
          name: 'Team 3',
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Count teams in org1
      const org1Count = await dataAccessService.countOrganizationRecords('teams', orgId1);
      expect(org1Count).toBe(2);

      // Count teams in org2
      const org2Count = await dataAccessService.countOrganizationRecords('teams', orgId2);
      expect(org2Count).toBe(1);
    });
  });

  describe('AccessControlService', () => {
    it('should validate organization access correctly', async () => {
      const userId = 'user-123';
      const orgId = 'org-123';

      // Create user
      await db('users').insert({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create organization
      await db('organizations').insert({
        id: orgId,
        name: 'Test Org',
        slug: 'test-org',
        ownerId: userId,
        settings: JSON.stringify({ allowPublicSignup: false, defaultRole: 'MEMBER' }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create membership
      await db('memberships').insert({
        id: 'membership-123',
        userId,
        organizationId: orgId,
        role: Role.ADMIN,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Test valid access
      const { hasAccess, membership } = await accessControlService.validateOrganizationAccess(
        userId,
        orgId
      );
      expect(hasAccess).toBe(true);
      expect(membership?.role).toBe(Role.ADMIN);

      // Test invalid access (different org)
      const { hasAccess: noAccess } = await accessControlService.validateOrganizationAccess(
        userId,
        'non-existent-org'
      );
      expect(noAccess).toBe(false);
    });

    it('should get user permissions correctly', async () => {
      const userId = 'user-123';
      const orgId = 'org-123';

      // Create user
      await db('users').insert({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create organization
      await db('organizations').insert({
        id: orgId,
        name: 'Test Org',
        slug: 'test-org',
        ownerId: userId,
        settings: JSON.stringify({ allowPublicSignup: false, defaultRole: 'MEMBER' }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create membership with MANAGER role
      await db('memberships').insert({
        id: 'membership-123',
        userId,
        organizationId: orgId,
        role: Role.MANAGER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const permissions = await accessControlService.getUserOrganizationPermissions(
        userId,
        orgId
      );

      // MANAGER should have specific permissions
      expect(permissions).toContain('org:view');
      expect(permissions).toContain('member:invite');
      expect(permissions).toContain('team:create');
      expect(permissions).toContain('audit:view');
      
      // But not owner-only permissions
      expect(permissions).not.toContain('org:transfer');
      expect(permissions).not.toContain('debug:manage');
    });

    it('should create tenant context correctly', async () => {
      const userId = 'user-123';
      const orgId = 'org-123';

      // Create user
      await db('users').insert({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create organization
      await db('organizations').insert({
        id: orgId,
        name: 'Test Org',
        slug: 'test-org',
        ownerId: userId,
        settings: JSON.stringify({ allowPublicSignup: false, defaultRole: 'MEMBER' }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create membership
      await db('memberships').insert({
        id: 'membership-123',
        userId,
        organizationId: orgId,
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const tenantContext = await accessControlService.createTenantContext(userId, orgId);

      expect(tenantContext).toBeTruthy();
      expect(tenantContext?.organizationId).toBe(orgId);
      expect(tenantContext?.userId).toBe(userId);
      expect(tenantContext?.userRole).toBe(Role.OWNER);
      expect(tenantContext?.permissions).toContain('org:transfer');
    });
  });
});