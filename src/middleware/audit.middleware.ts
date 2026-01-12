import { Request, Response, NextFunction } from 'express';
import { auditService, AuditContext } from '../services/audit.service';

export interface AuditableRequest extends Request {
  auditContext?: Partial<AuditContext>;
}

/**
 * Middleware to automatically log audit entries for mutating actions
 * This middleware should be applied after authentication and tenant context middleware
 */
export const auditMiddleware = (action: string, entityType: string) => {
  return async (req: AuditableRequest, res: Response, next: NextFunction) => {
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Only log if the request was successful (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Extract audit context from request
        const organizationId = req.organizationId;
        const actorUserId = req.userId;
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';

        if (organizationId && actorUserId) {
          // Determine entity ID from request params or body
          let entityId = req.params['id'] || req.params['userId'] || req.params['teamId'] || req.params['orgId'];
          
          // For creation operations, get ID from response body
          if (!entityId && body && body.id) {
            entityId = body.id;
          }

          // Get before/after states from request context if available
          const beforeState = req.auditContext?.beforeState;
          const afterState = req.auditContext?.afterState || body;

          const auditContext: AuditContext = {
            organizationId,
            actorUserId,
            action,
            entityType,
            entityId: entityId || 'unknown',
            beforeState: beforeState,
            afterState,
            ipAddress,
            userAgent,
          };

          // Log audit entry asynchronously (don't block response)
          auditService.logAction(auditContext).catch(error => {
            console.error('Failed to log audit entry:', error);
          });
        }
      }

      // Call original json method
      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Helper middleware to capture before state for update operations
 */
export const captureBeforeState = (getEntityFn: (req: Request) => Promise<any>) => {
  return async (req: AuditableRequest, _res: Response, next: NextFunction) => {
    try {
      const beforeState = await getEntityFn(req);
      req.auditContext = { beforeState };
    } catch (error) {
      // If we can't get before state, continue without it
      console.warn('Failed to capture before state for audit:', error);
    }
    next();
  };
};

/**
 * Predefined audit middleware for common operations
 */
export const auditMiddlewares = {
  // User operations
  userCreated: auditMiddleware('user.created', 'user'),
  userUpdated: auditMiddleware('user.updated', 'user'),
  userDeleted: auditMiddleware('user.deleted', 'user'),
  userLogin: auditMiddleware('user.login', 'user'),
  userLogout: auditMiddleware('user.logout', 'user'),
  userPasswordReset: auditMiddleware('user.password_reset', 'user'),
  userEmailVerified: auditMiddleware('user.email_verified', 'user'),

  // Organization operations
  organizationCreated: auditMiddleware('organization.created', 'organization'),
  organizationUpdated: auditMiddleware('organization.updated', 'organization'),
  organizationDeleted: auditMiddleware('organization.deleted', 'organization'),
  organizationOwnershipTransferred: auditMiddleware('organization.ownership_transferred', 'organization'),

  // Membership operations
  memberInvited: auditMiddleware('member.invited', 'membership'),
  memberJoined: auditMiddleware('member.joined', 'membership'),
  memberRoleUpdated: auditMiddleware('member.role_updated', 'membership'),
  memberRemoved: auditMiddleware('member.removed', 'membership'),
  memberSuspended: auditMiddleware('member.suspended', 'membership'),
  memberReactivated: auditMiddleware('member.reactivated', 'membership'),

  // Team operations
  teamCreated: auditMiddleware('team.created', 'team'),
  teamUpdated: auditMiddleware('team.updated', 'team'),
  teamDeleted: auditMiddleware('team.deleted', 'team'),
  teamMemberAdded: auditMiddleware('team.member_added', 'team_membership'),
  teamMemberRemoved: auditMiddleware('team.member_removed', 'team_membership'),

  // Invitation operations
  invitationSent: auditMiddleware('invitation.sent', 'invitation'),
  invitationAccepted: auditMiddleware('invitation.accepted', 'invitation'),
  invitationRevoked: auditMiddleware('invitation.revoked', 'invitation'),
  invitationExpired: auditMiddleware('invitation.expired', 'invitation'),
};