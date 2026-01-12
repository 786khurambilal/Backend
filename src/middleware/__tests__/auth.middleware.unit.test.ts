import { 
  getPermissionsForRole,
  roleHasPermission 
} from '../auth.middleware';
import { Role, Permission } from '../../types';

describe('Auth Middleware Utilities', () => {
  describe('getPermissionsForRole', () => {
    it('should return correct permissions for OWNER role', () => {
      const permissions = getPermissionsForRole(Role.OWNER);
      
      expect(permissions).toContain(Permission.ORG_TRANSFER);
      expect(permissions).toContain(Permission.ORG_MANAGE);
      expect(permissions).toContain(Permission.ORG_VIEW);
      expect(permissions).toContain(Permission.MEMBER_INVITE);
      expect(permissions).toContain(Permission.MEMBER_MANAGE);
      expect(permissions).toContain(Permission.TEAM_CREATE);
      expect(permissions).toContain(Permission.AUDIT_VIEW);
      expect(permissions).toContain(Permission.DEBUG_MANAGE);
    });

    it('should return correct permissions for ADMIN role', () => {
      const permissions = getPermissionsForRole(Role.ADMIN);
      
      expect(permissions).not.toContain(Permission.ORG_TRANSFER);
      expect(permissions).toContain(Permission.ORG_MANAGE);
      expect(permissions).toContain(Permission.ORG_VIEW);
      expect(permissions).toContain(Permission.MEMBER_INVITE);
      expect(permissions).toContain(Permission.MEMBER_MANAGE);
      expect(permissions).toContain(Permission.TEAM_CREATE);
      expect(permissions).toContain(Permission.AUDIT_VIEW);
      expect(permissions).toContain(Permission.DEBUG_MANAGE);
    });

    it('should return correct permissions for MANAGER role', () => {
      const permissions = getPermissionsForRole(Role.MANAGER);
      
      expect(permissions).not.toContain(Permission.ORG_TRANSFER);
      expect(permissions).not.toContain(Permission.ORG_MANAGE);
      expect(permissions).toContain(Permission.ORG_VIEW);
      expect(permissions).toContain(Permission.MEMBER_INVITE);
      expect(permissions).not.toContain(Permission.MEMBER_MANAGE);
      expect(permissions).toContain(Permission.TEAM_CREATE);
      expect(permissions).toContain(Permission.AUDIT_VIEW);
      expect(permissions).not.toContain(Permission.DEBUG_MANAGE);
    });

    it('should return correct permissions for MEMBER role', () => {
      const permissions = getPermissionsForRole(Role.MEMBER);
      
      expect(permissions).not.toContain(Permission.ORG_TRANSFER);
      expect(permissions).not.toContain(Permission.ORG_MANAGE);
      expect(permissions).toContain(Permission.ORG_VIEW);
      expect(permissions).not.toContain(Permission.MEMBER_INVITE);
      expect(permissions).not.toContain(Permission.MEMBER_MANAGE);
      expect(permissions).not.toContain(Permission.TEAM_CREATE);
      expect(permissions).not.toContain(Permission.AUDIT_VIEW);
      expect(permissions).not.toContain(Permission.DEBUG_MANAGE);
    });

    it('should return correct permissions for VIEWER role', () => {
      const permissions = getPermissionsForRole(Role.VIEWER);
      
      expect(permissions).not.toContain(Permission.ORG_TRANSFER);
      expect(permissions).not.toContain(Permission.ORG_MANAGE);
      expect(permissions).toContain(Permission.ORG_VIEW);
      expect(permissions).not.toContain(Permission.MEMBER_INVITE);
      expect(permissions).not.toContain(Permission.MEMBER_MANAGE);
      expect(permissions).not.toContain(Permission.TEAM_CREATE);
      expect(permissions).not.toContain(Permission.AUDIT_VIEW);
      expect(permissions).not.toContain(Permission.DEBUG_MANAGE);
    });
  });

  describe('roleHasPermission', () => {
    it('should correctly check if OWNER has ORG_TRANSFER permission', () => {
      expect(roleHasPermission(Role.OWNER, Permission.ORG_TRANSFER)).toBe(true);
    });

    it('should correctly check if ADMIN does not have ORG_TRANSFER permission', () => {
      expect(roleHasPermission(Role.ADMIN, Permission.ORG_TRANSFER)).toBe(false);
    });

    it('should correctly check if MEMBER has ORG_VIEW permission', () => {
      expect(roleHasPermission(Role.MEMBER, Permission.ORG_VIEW)).toBe(true);
    });

    it('should correctly check if MEMBER does not have ORG_MANAGE permission', () => {
      expect(roleHasPermission(Role.MEMBER, Permission.ORG_MANAGE)).toBe(false);
    });

    it('should correctly check if VIEWER has basic view permissions', () => {
      expect(roleHasPermission(Role.VIEWER, Permission.ORG_VIEW)).toBe(true);
      expect(roleHasPermission(Role.VIEWER, Permission.MEMBER_VIEW)).toBe(true);
      expect(roleHasPermission(Role.VIEWER, Permission.TEAM_VIEW)).toBe(true);
    });

    it('should correctly check if VIEWER does not have management permissions', () => {
      expect(roleHasPermission(Role.VIEWER, Permission.ORG_MANAGE)).toBe(false);
      expect(roleHasPermission(Role.VIEWER, Permission.MEMBER_MANAGE)).toBe(false);
      expect(roleHasPermission(Role.VIEWER, Permission.TEAM_MANAGE)).toBe(false);
    });
  });

  describe('Permission hierarchy validation', () => {
    it('should ensure OWNER has all permissions', () => {
      const ownerPermissions = getPermissionsForRole(Role.OWNER);
      const allPermissions = Object.values(Permission);
      
      // OWNER should have all permissions
      allPermissions.forEach(permission => {
        expect(ownerPermissions).toContain(permission);
      });
    });

    it('should ensure role hierarchy is respected', () => {
      const ownerPermissions = getPermissionsForRole(Role.OWNER);
      const adminPermissions = getPermissionsForRole(Role.ADMIN);
      const managerPermissions = getPermissionsForRole(Role.MANAGER);
      const memberPermissions = getPermissionsForRole(Role.MEMBER);
      const viewerPermissions = getPermissionsForRole(Role.VIEWER);

      // OWNER should have more permissions than ADMIN
      expect(ownerPermissions.length).toBeGreaterThan(adminPermissions.length);
      
      // ADMIN should have more permissions than MANAGER
      expect(adminPermissions.length).toBeGreaterThan(managerPermissions.length);
      
      // MANAGER should have more permissions than MEMBER
      expect(managerPermissions.length).toBeGreaterThan(memberPermissions.length);
      
      // MEMBER and VIEWER should have same permissions (both basic roles)
      expect(memberPermissions.length).toBe(viewerPermissions.length);
    });

    it('should ensure all roles have at least basic view permissions', () => {
      const roles = [Role.OWNER, Role.ADMIN, Role.MANAGER, Role.MEMBER, Role.VIEWER];
      const basicPermissions = [Permission.ORG_VIEW, Permission.MEMBER_VIEW, Permission.TEAM_VIEW];

      roles.forEach(role => {
        const permissions = getPermissionsForRole(role);
        basicPermissions.forEach(basicPermission => {
          expect(permissions).toContain(basicPermission);
        });
      });
    });
  });
});