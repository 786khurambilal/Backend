import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/auth.service';
import { db } from '../database/connection';
import { User, Membership, Role, Permission } from '../types';
import { logger } from '../config/logger';
import { env } from '../config/env';

// Extend Express Request interface to include user context
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      organizationId?: string;
      userRole?: Role;
      permissions?: Permission[];
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: User;
  userId: string;
}

export interface OrganizationRequest extends AuthenticatedRequest {
  organizationId: string;
  userRole: Role;
  permissions: Permission[];
}

// Permission matrix mapping roles to permissions
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
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

/**
 * Middleware to require authentication
 * Verifies JWT token and attaches user to request
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = await authService.verifyAccessToken(token);

    // Get user from database
    const user = await db<User>('users')
      .where({ id: payload.userId })
      .first();

    if (!user) {
      res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    logger.debug({ error }, 'Authentication failed');
    
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
        timestamp: new Date().toISOString(),
      },
    });
  }
};

/**
 * Middleware to require organization membership
 * Must be used after requireAuth
 */
export const requireOrgMembership = (orgIdParam: string = 'orgId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const organizationId = req.params[orgIdParam];
      
      if (!organizationId) {
        res.status(400).json({
          error: {
            code: 'MISSING_ORGANIZATION_ID',
            message: 'Organization ID is required',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Check if user is a member of the organization
      const membership = await db<Membership>('memberships')
        .where('userId', req.userId)
        .where('organizationId', organizationId)
        .where('status', 'ACTIVE')
        .first();

      if (!membership) {
        res.status(403).json({
          error: {
            code: 'ORGANIZATION_ACCESS_DENIED',
            message: 'Access to this organization is denied',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Attach organization context to request
      req.organizationId = organizationId;
      req.userRole = membership.role;
      req.permissions = ROLE_PERMISSIONS[membership.role] || [];

      next();
    } catch (error) {
      logger.error({ error }, 'Organization membership check failed');
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
};

/**
 * Middleware to require specific role or higher
 * Must be used after requireAuth and requireOrgMembership
 */
export const requireRole = (requiredRole: Role) => {
  const roleHierarchy: Record<Role, number> = {
    [Role.VIEWER]: 1,
    [Role.MEMBER]: 2,
    [Role.MANAGER]: 3,
    [Role.ADMIN]: 4,
    [Role.OWNER]: 5,
  };

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      _res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const userRoleLevel = roleHierarchy[req.userRole];
    const requiredRoleLevel = roleHierarchy[requiredRole];

    if (userRoleLevel < requiredRoleLevel) {
      _res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `${requiredRole} role or higher required`,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to require specific permission
 * Must be used after requireAuth and requireOrgMembership
 */
export const requirePermission = (requiredPermission: Permission) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.permissions) {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication and organization membership required',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (!req.permissions.includes(requiredPermission)) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Permission '${requiredPermission}' required`,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, // Default: 15 minutes
  max: env.RATE_LIMIT_MAX_REQUESTS, // Default: 5 attempts per window
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req: Request): string => {
    // Use IP address as the key for rate limiting
    return req.ip || 'unknown';
  },
  skip: (): boolean => {
    // Skip rate limiting in test environment
    return env.NODE_ENV === 'test';
  },
  handler: (req: Request, res: Response): void => {
    logger.warn({
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      route: req.route?.path,
      method: req.method,
    }, 'Rate limit exceeded for authentication endpoint');
    
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later',
        timestamp: new Date().toISOString(),
      },
    });
  },
});

/**
 * General rate limiting middleware for API endpoints
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  skip: (): boolean => {
    return env.NODE_ENV === 'test';
  },
});

/**
 * Optional authentication middleware
 * Attaches user to request if token is provided, but doesn't require it
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const payload = await authService.verifyAccessToken(token);

    const user = await db<User>('users')
      .where({ id: payload.userId })
      .first();

    if (user) {
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    logger.debug({ error }, 'Optional authentication failed');
    next();
  }
};

/**
 * Utility function to get permissions for a role
 */
export const getPermissionsForRole = (role: Role): Permission[] => {
  return ROLE_PERMISSIONS[role] || [];
};

/**
 * Utility function to check if a role has a specific permission
 */
export const roleHasPermission = (role: Role, permission: Permission): boolean => {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
};

/**
 * Middleware factory to combine authentication, organization membership, and permission checks
 */
export const requireOrgPermission = (orgIdParam: string = 'orgId', permission: Permission) => {
  return [
    requireAuth,
    requireOrgMembership(orgIdParam),
    requirePermission(permission),
  ];
};

/**
 * Middleware factory to combine authentication, organization membership, and role checks
 */
export const requireOrgRole = (orgIdParam: string = 'orgId', role: Role) => {
  return [
    requireAuth,
    requireOrgMembership(orgIdParam),
    requireRole(role),
  ];
};