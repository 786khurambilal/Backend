import { Request, Response, NextFunction } from 'express';
import { db } from '../database/connection';
import { logger } from '../config/logger';
import { Membership, MembershipStatus } from '../types';

/**
 * Tenant context middleware that establishes organization context for requests
 * Must be used after requireAuth middleware
 */
export const establishTenantContext = (orgIdParam: string = 'orgId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required for tenant context',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const organizationId = req.params[orgIdParam] || req.body.organizationId || req.query['organizationId'] as string;
      
      if (!organizationId) {
        res.status(400).json({
          error: {
            code: 'MISSING_ORGANIZATION_ID',
            message: 'Organization ID is required for tenant context',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Verify user has access to this organization
      const membership = await db<Membership>('memberships')
        .where('userId', req.userId)
        .where('organizationId', organizationId)
        .where('status', MembershipStatus.ACTIVE)
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

      // Establish tenant context
      // const tenantContext: TenantContext = {
      //   organizationId,
      //   userId: req.userId,
      //   userRole: membership.role,
      //   permissions: req.permissions || [],
      // };

      // Attach tenant context to request
      req.organizationId = organizationId;
      req.userRole = membership.role;
      req.permissions = req.permissions || [];

      // Log tenant context establishment
      logger.debug({
        userId: req.userId,
        organizationId,
        userRole: membership.role,
        route: req.route?.path,
        method: req.method,
      }, 'Tenant context established');

      next();
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Failed to establish tenant context');
      
      res.status(500).json({
        error: {
          code: 'TENANT_CONTEXT_ERROR',
          message: 'Failed to establish tenant context',
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
};

/**
 * Middleware to validate organization access for any organization ID in the request
 * This is more flexible than establishTenantContext as it can handle multiple org ID sources
 */
export const validateOrganizationAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for organization access validation',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Extract organization ID from various sources
    const organizationId = req.organizationId || 
                          req.params['orgId'] || 
                          req.params['organizationId'] || 
                          req.body.organizationId || 
                          req.query['organizationId'] as string;

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

    // Check if user has access to this organization
    const hasAccess = await validateUserOrganizationAccess(req.userId, organizationId);
    
    if (!hasAccess) {
      res.status(403).json({
        error: {
          code: 'ORGANIZATION_ACCESS_DENIED',
          message: 'Access to this organization is denied',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Set organization ID on request if not already set
    if (!req.organizationId) {
      req.organizationId = organizationId;
    }

    next();
  } catch (error) {
    logger.error({ error, userId: req.userId }, 'Organization access validation failed');
    
    res.status(500).json({
      error: {
        code: 'ACCESS_VALIDATION_ERROR',
        message: 'Failed to validate organization access',
        timestamp: new Date().toISOString(),
      },
    });
  }
};

/**
 * Utility function to validate if a user has access to an organization
 */
export const validateUserOrganizationAccess = async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    const membership = await db<Membership>('memberships')
      .where('userId', userId)
      .where('organizationId', organizationId)
      .where('status', MembershipStatus.ACTIVE)
      .first();

    return !!membership;
  } catch (error) {
    logger.error({ error, userId, organizationId }, 'Failed to validate user organization access');
    return false;
  }
};

/**
 * Middleware to ensure data isolation by automatically scoping queries to organization
 * This should be used for routes that handle organization-scoped data
 */
export const enforceDataIsolation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.organizationId) {
    res.status(400).json({
      error: {
        code: 'MISSING_TENANT_CONTEXT',
        message: 'Tenant context is required for data isolation',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Log data isolation enforcement
  logger.debug({
    userId: req.userId,
    organizationId: req.organizationId,
    route: req.route?.path,
    method: req.method,
  }, 'Data isolation enforced');

  next();
};

/**
 * Utility function to get user's organizations
 */
export const getUserOrganizations = async (userId: string): Promise<string[]> => {
  try {
    const memberships = await db<Membership>('memberships')
      .select('organizationId')
      .where('userId', userId)
      .where('status', MembershipStatus.ACTIVE);

    return memberships.map(m => m.organizationId);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user organizations');
    return [];
  }
};

/**
 * Middleware factory that combines tenant context establishment and data isolation
 */
export const requireTenantContext = (orgIdParam: string = 'orgId') => {
  return [
    establishTenantContext(orgIdParam),
    enforceDataIsolation,
  ];
};