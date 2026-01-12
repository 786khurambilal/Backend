import { db } from '../database/connection';
import { logger } from '../config/logger';
import { 
  TenantContext, 
  Membership, 
  MembershipStatus, 
  Role, 
  Permission,
  Team,
  TeamMembership
} from '../types';

/**
 * Access control service that provides organization-level access validation
 * and permission checking for multi-tenant operations
 */
export class AccessControlService {
  /**
   * Validate that a user has access to an organization
   */
  async validateOrganizationAccess(
    userId: string,
    organizationId: string
  ): Promise<{ hasAccess: boolean; membership?: Membership }> {
    try {
      const membership = await db<Membership>('memberships')
        .where('userId', userId)
        .where('organizationId', organizationId)
        .where('status', MembershipStatus.ACTIVE)
        .first();

      const hasAccess = !!membership;

      logger.debug({
        userId,
        organizationId,
        hasAccess,
        role: membership?.role,
      }, 'Validated organization access');

      return { hasAccess, ...(membership && { membership }) };
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to validate organization access');
      return { hasAccess: false };
    }
  }

  /**
   * Get user's role in an organization
   */
  async getUserOrganizationRole(
    userId: string,
    organizationId: string
  ): Promise<Role | null> {
    try {
      const membership = await db<Membership>('memberships')
        .select('role')
        .where('userId', userId)
        .where('organizationId', organizationId)
        .where('status', MembershipStatus.ACTIVE)
        .first();

      return membership?.role || null;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get user organization role');
      return null;
    }
  }

  /**
   * Get user's permissions in an organization
   */
  async getUserOrganizationPermissions(
    userId: string,
    organizationId: string
  ): Promise<Permission[]> {
    try {
      const role = await this.getUserOrganizationRole(userId, organizationId);
      
      if (!role) {
        return [];
      }

      return this.getPermissionsForRole(role);
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get user organization permissions');
      return [];
    }
  }

  /**
   * Check if user has a specific permission in an organization
   */
  async hasOrganizationPermission(
    userId: string,
    organizationId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      const permissions = await this.getUserOrganizationPermissions(userId, organizationId);
      return permissions.includes(permission);
    } catch (error) {
      logger.error({ error, userId, organizationId, permission }, 'Failed to check organization permission');
      return false;
    }
  }

  /**
   * Check if user has any of the specified permissions in an organization
   */
  async hasAnyOrganizationPermission(
    userId: string,
    organizationId: string,
    permissions: Permission[]
  ): Promise<boolean> {
    try {
      const userPermissions = await this.getUserOrganizationPermissions(userId, organizationId);
      return permissions.some(permission => userPermissions.includes(permission));
    } catch (error) {
      logger.error({ error, userId, organizationId, permissions }, 'Failed to check any organization permission');
      return false;
    }
  }

  /**
   * Check if user has all of the specified permissions in an organization
   */
  async hasAllOrganizationPermissions(
    userId: string,
    organizationId: string,
    permissions: Permission[]
  ): Promise<boolean> {
    try {
      const userPermissions = await this.getUserOrganizationPermissions(userId, organizationId);
      return permissions.every(permission => userPermissions.includes(permission));
    } catch (error) {
      logger.error({ error, userId, organizationId, permissions }, 'Failed to check all organization permissions');
      return false;
    }
  }

  /**
   * Validate that a user can access a specific team
   */
  async validateTeamAccess(
    userId: string,
    teamId: string
  ): Promise<{ hasAccess: boolean; team?: Team; isTeamMember?: boolean }> {
    try {
      // Get team information
      const team = await db<Team>('teams')
        .where('id', teamId)
        .first();

      if (!team) {
        return { hasAccess: false };
      }

      // Check if user has access to the organization
      const { hasAccess: hasOrgAccess } = await this.validateOrganizationAccess(
        userId,
        team.organizationId
      );

      if (!hasOrgAccess) {
        return { hasAccess: false, team };
      }

      // Check if user is a team member
      const teamMembership = await db<TeamMembership>('team_memberships')
        .where('teamId', teamId)
        .where('userId', userId)
        .first();

      const isTeamMember = !!teamMembership;

      logger.debug({
        userId,
        teamId,
        organizationId: team.organizationId,
        hasOrgAccess,
        isTeamMember,
      }, 'Validated team access');

      return { hasAccess: true, team, isTeamMember };
    } catch (error) {
      logger.error({ error, userId, teamId }, 'Failed to validate team access');
      return { hasAccess: false };
    }
  }

  /**
   * Get all organizations a user has access to
   */
  async getUserOrganizations(userId: string): Promise<string[]> {
    try {
      const memberships = await db<Membership>('memberships')
        .select('organizationId')
        .where('userId', userId)
        .where('status', MembershipStatus.ACTIVE);

      const organizationIds = memberships.map(m => m.organizationId);

      logger.debug({
        userId,
        organizationCount: organizationIds.length,
      }, 'Retrieved user organizations');

      return organizationIds;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user organizations');
      return [];
    }
  }

  /**
   * Validate that multiple records belong to organizations the user has access to
   */
  async validateMultiOrganizationAccess(
    userId: string,
    organizationIds: string[]
  ): Promise<{ validOrganizations: string[]; invalidOrganizations: string[] }> {
    try {
      const userOrganizations = await this.getUserOrganizations(userId);
      
      const validOrganizations = organizationIds.filter(orgId => 
        userOrganizations.includes(orgId)
      );
      
      const invalidOrganizations = organizationIds.filter(orgId => 
        !userOrganizations.includes(orgId)
      );

      logger.debug({
        userId,
        requestedOrganizations: organizationIds,
        validOrganizations,
        invalidOrganizations,
      }, 'Validated multi-organization access');

      return { validOrganizations, invalidOrganizations };
    } catch (error) {
      logger.error({ error, userId, organizationIds }, 'Failed to validate multi-organization access');
      return { validOrganizations: [], invalidOrganizations: organizationIds };
    }
  }

  /**
   * Create a tenant context for a user and organization
   */
  async createTenantContext(
    userId: string,
    organizationId: string
  ): Promise<TenantContext | null> {
    try {
      const { hasAccess, membership } = await this.validateOrganizationAccess(
        userId,
        organizationId
      );

      if (!hasAccess || !membership) {
        return null;
      }

      const permissions = this.getPermissionsForRole(membership.role);

      const tenantContext: TenantContext = {
        organizationId,
        userId,
        userRole: membership.role,
        permissions,
      };

      logger.debug({
        userId,
        organizationId,
        userRole: membership.role,
        permissionCount: permissions.length,
      }, 'Created tenant context');

      return tenantContext;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to create tenant context');
      return null;
    }
  }

  /**
   * Validate tenant context and ensure it's still valid
   */
  async validateTenantContext(tenantContext: TenantContext): Promise<boolean> {
    try {
      const { hasAccess } = await this.validateOrganizationAccess(
        tenantContext.userId,
        tenantContext.organizationId
      );

      logger.debug({
        userId: tenantContext.userId,
        organizationId: tenantContext.organizationId,
        isValid: hasAccess,
      }, 'Validated tenant context');

      return hasAccess;
    } catch (error) {
      logger.error({ error, tenantContext }, 'Failed to validate tenant context');
      return false;
    }
  }

  /**
   * Check if a user can perform an action on a resource within an organization
   */
  async canPerformAction(
    userId: string,
    organizationId: string,
    action: Permission,
    resourceType?: string,
    resourceId?: string
  ): Promise<boolean> {
    try {
      // First check basic organization access and permission
      const hasPermission = await this.hasOrganizationPermission(userId, organizationId, action);
      
      if (!hasPermission) {
        return false;
      }

      // Additional resource-specific checks can be added here
      // For example, checking if user owns a specific resource
      if (resourceType && resourceId) {
        // This could be extended to check resource-specific permissions
        logger.debug({
          userId,
          organizationId,
          action,
          resourceType,
          resourceId,
        }, 'Performing resource-specific access check');
      }

      return true;
    } catch (error) {
      logger.error({
        error,
        userId,
        organizationId,
        action,
        resourceType,
        resourceId,
      }, 'Failed to check if user can perform action');
      return false;
    }
  }

  /**
   * Get permissions for a role
   */
  private getPermissionsForRole(role: Role): Permission[] {
    const rolePermissions: Record<Role, Permission[]> = {
      [Role.OWNER]: [
        Permission.ORG_MANAGE,
        Permission.ORG_VIEW,
        Permission.ORG_TRANSFER,
        Permission.MEMBER_INVITE,
        Permission.MEMBER_MANAGE,
        Permission.MEMBER_VIEW,
        Permission.TEAM_CREATE,
        Permission.TEAM_MANAGE,
        Permission.TEAM_VIEW,
        Permission.AUDIT_VIEW,
        Permission.DEBUG_MANAGE,
      ],
      [Role.ADMIN]: [
        Permission.ORG_MANAGE,
        Permission.ORG_VIEW,
        Permission.MEMBER_INVITE,
        Permission.MEMBER_MANAGE,
        Permission.MEMBER_VIEW,
        Permission.TEAM_CREATE,
        Permission.TEAM_MANAGE,
        Permission.TEAM_VIEW,
        Permission.AUDIT_VIEW,
        Permission.DEBUG_MANAGE,
      ],
      [Role.MANAGER]: [
        Permission.ORG_VIEW,
        Permission.MEMBER_INVITE,
        Permission.MEMBER_VIEW,
        Permission.TEAM_CREATE,
        Permission.TEAM_MANAGE,
        Permission.TEAM_VIEW,
        Permission.AUDIT_VIEW,
      ],
      [Role.MEMBER]: [
        Permission.ORG_VIEW,
        Permission.MEMBER_VIEW,
        Permission.TEAM_VIEW,
      ],
      [Role.VIEWER]: [
        Permission.ORG_VIEW,
        Permission.MEMBER_VIEW,
        Permission.TEAM_VIEW,
      ],
    };

    return rolePermissions[role] || [];
  }

  /**
   * Audit access attempt
   */
  async auditAccessAttempt(
    userId: string,
    organizationId: string,
    action: string,
    resource: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      // This could be extended to log to an audit table
      logger.info({
        userId,
        organizationId,
        action,
        resource,
        success,
        ipAddress,
        userAgent,
        timestamp: new Date().toISOString(),
      }, 'Access attempt audited');
    } catch (error) {
      logger.error({ error }, 'Failed to audit access attempt');
    }
  }
}

// Export singleton instance
export const accessControlService = new AccessControlService();