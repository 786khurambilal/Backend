import { Request, Response, NextFunction } from 'express';
import { 
  requireAuth, 
  requireOrgMembership, 
  requirePermission, 
  requireRole,
  getPermissionsForRole,
  roleHasPermission 
} from '../auth.middleware';
import { Role, Permission, User, Membership } from '../../types';

// Mock all external dependencies
jest.mock('../../services/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn(),
  },
}));

jest.mock('../../database/connection', () => ({
  db: jest.fn(),
}));

jest.mock('../../config/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 5,
  },
}));

// Import mocked modules
import { authService } from '../../services/auth.service';
import { db } from '../../database/connection';

const mockAuthService = authService as jest.Mocked<typeof authService>;
const mockDb = db as jest.Mocked<typeof db>;

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      params: {},
      ip: '127.0.0.1',
      get: jest.fn(),
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should authenticate valid token and attach user to request', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthService.verifyAccessToken.mockResolvedValue({
        userId: 'user-1',
        email: 'test@example.com',
      });

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUser),
      });

      await requireAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockRequest.user).toEqual(mockUser);
      expect(mockRequest.userId).toBe('user-1');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      await requireAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required',
          timestamp: expect.any(String),
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      mockAuthService.verifyAccessToken.mockRejectedValue(new Error('Invalid token'));

      await requireAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
          timestamp: expect.any(String),
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireOrgMembership', () => {
    const middleware = requireOrgMembership('orgId');

    it('should allow access for active organization member', async () => {
      const mockMembership: Membership = {
        id: 'membership-1',
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.MEMBER,
        status: 'ACTIVE' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRequest.userId = 'user-1';
      mockRequest.params = { orgId: 'org-1' };

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockMembership),
      });

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.organizationId).toBe('org-1');
      expect(mockRequest.userRole).toBe(Role.MEMBER);
      expect(mockRequest.permissions).toEqual(getPermissionsForRole(Role.MEMBER));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for non-member', async () => {
      mockRequest.userId = 'user-1';
      mockRequest.params = { orgId: 'org-1' };

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'ORGANIZATION_ACCESS_DENIED',
          message: 'Access to this organization is denied',
          timestamp: expect.any(String),
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    const middleware = requirePermission(Permission.ORG_MANAGE);

    it('should allow access when user has required permission', () => {
      mockRequest.permissions = [Permission.ORG_MANAGE, Permission.ORG_VIEW];

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access when user lacks required permission', () => {
      mockRequest.permissions = [Permission.ORG_VIEW];

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Permission '${Permission.ORG_MANAGE}' required`,
          timestamp: expect.any(String),
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    const middleware = requireRole(Role.ADMIN);

    it('should allow access for user with required role or higher', () => {
      mockRequest.userRole = Role.OWNER;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for user with insufficient role', () => {
      mockRequest.userRole = Role.MEMBER;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `${Role.ADMIN} role or higher required`,
          timestamp: expect.any(String),
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Permission utilities', () => {
    it('should return correct permissions for each role', () => {
      expect(getPermissionsForRole(Role.OWNER)).toContain(Permission.ORG_TRANSFER);
      expect(getPermissionsForRole(Role.ADMIN)).not.toContain(Permission.ORG_TRANSFER);
      expect(getPermissionsForRole(Role.MEMBER)).toContain(Permission.ORG_VIEW);
      expect(getPermissionsForRole(Role.VIEWER)).toContain(Permission.ORG_VIEW);
    });

    it('should correctly check if role has permission', () => {
      expect(roleHasPermission(Role.OWNER, Permission.ORG_TRANSFER)).toBe(true);
      expect(roleHasPermission(Role.ADMIN, Permission.ORG_TRANSFER)).toBe(false);
      expect(roleHasPermission(Role.MEMBER, Permission.ORG_VIEW)).toBe(true);
    });
  });
});