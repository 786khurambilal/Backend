import { Router } from 'express';
import { z } from 'zod';
import { auditService, AuditFilters } from '../services/audit.service';
import { requireAuth } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/auth.middleware';
import { Permission, PaginationParams } from '../types';
import { validateRequest } from '../middleware/validation.middleware';

/**
 * @swagger
 * tags:
 *   name: Audit
 *   description: Audit log endpoints for tracking system changes and user actions
 */

const router = Router();

// Validation schemas
const getAuditLogsSchema = {
  query: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 100) : 50),
    sortBy: z.enum(['created_at', 'action', 'entity_type', 'actor_user_id']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    actorUserId: z.string().uuid().optional(),
    action: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  }),
  params: z.object({
    orgId: z.string().uuid(),
  }),
};

const getEntityAuditLogsSchema = {
  query: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 100) : 50),
    sortBy: z.enum(['created_at', 'action', 'actor_user_id']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  params: z.object({
    orgId: z.string().uuid(),
    entityType: z.string(),
    entityId: z.string(),
  }),
};

const getUserAuditLogsSchema = {
  query: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 100) : 50),
    sortBy: z.enum(['created_at', 'action', 'entity_type']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  params: z.object({
    orgId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
};

/**
 * @swagger
 * /organizations/{orgId}/audit-logs:
 *   get:
 *     summary: Get audit logs for an organization
 *     description: Returns paginated audit logs for the specified organization with optional filtering
 *     tags: [Audit]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Organization ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_at, action, entity_type, actor_user_id]
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *       - in: query
 *         name: actorUserId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user who performed the action
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter by entity type
 *       - in: query
 *         name: entityId
 *         schema:
 *           type: string
 *         description: Filter by entity ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedAuditLogsResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Insufficient permissions or access denied to organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/organizations/:orgId/audit-logs',
  requireAuth,
  requirePermission(Permission.AUDIT_VIEW),
  validateRequest(getAuditLogsSchema),
  async (req, res, next) => {
    try {
      const { orgId } = req.params;
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        actorUserId,
        action,
        entityType,
        entityId,
        startDate,
        endDate,
      } = req.query;

      // Ensure user can only access audit logs for their organization
      if (req.organizationId !== orgId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to organization audit logs',
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const filters: AuditFilters = {
        actorUserId: typeof actorUserId === 'string' ? actorUserId : undefined,
        action: typeof action === 'string' ? action : undefined,
        entityType: typeof entityType === 'string' ? entityType : undefined,
        entityId: typeof entityId === 'string' ? entityId : undefined,
        startDate: startDate instanceof Date ? startDate : undefined,
        endDate: endDate instanceof Date ? endDate : undefined,
      };

      const pagination: PaginationParams = {
        page: typeof page === 'number' ? page : 1,
        limit: typeof limit === 'number' ? limit : 50,
        ...(typeof sortBy === 'string' && { sortBy }),
        ...(typeof sortOrder === 'string' && { sortOrder: sortOrder as 'asc' | 'desc' }),
      };

      const result = await auditService.getAuditLogs(orgId!, filters, pagination);

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /organizations/:orgId/audit-logs/entity/:entityType/:entityId
 * Get audit logs for a specific entity
 */
router.get(
  '/organizations/:orgId/audit-logs/entity/:entityType/:entityId',
  requireAuth,
  requirePermission(Permission.AUDIT_VIEW),
  validateRequest(getEntityAuditLogsSchema),
  async (req, res, next) => {
    try {
      const { orgId, entityType, entityId } = req.params;
      const { page, limit, sortBy, sortOrder } = req.query;

      // Ensure user can only access audit logs for their organization
      if (req.organizationId !== orgId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to organization audit logs',
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const pagination: PaginationParams = {
        page: typeof page === 'number' ? page : 1,
        limit: typeof limit === 'number' ? limit : 50,
        ...(typeof sortBy === 'string' && { sortBy }),
        ...(typeof sortOrder === 'string' && { sortOrder: sortOrder as 'asc' | 'desc' }),
      };

      const result = await auditService.getEntityAuditLogs(
        orgId!,
        entityType!,
        entityId!,
        pagination
      );

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /organizations/:orgId/audit-logs/user/:userId
 * Get audit logs for a specific user's actions
 */
router.get(
  '/organizations/:orgId/audit-logs/user/:userId',
  requireAuth,
  requirePermission(Permission.AUDIT_VIEW),
  validateRequest(getUserAuditLogsSchema),
  async (req, res, next) => {
    try {
      const { orgId, userId } = req.params;
      const { page, limit, sortBy, sortOrder } = req.query;

      // Ensure user can only access audit logs for their organization
      if (req.organizationId !== orgId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to organization audit logs',
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const pagination: PaginationParams = {
        page: typeof page === 'number' ? page : 1,
        limit: typeof limit === 'number' ? limit : 50,
        ...(typeof sortBy === 'string' && { sortBy }),
        ...(typeof sortOrder === 'string' && { sortOrder: sortOrder as 'asc' | 'desc' }),
      };

      const result = await auditService.getUserAuditLogs(orgId!, userId!, pagination);

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /organizations/:orgId/audit-logs/actions
 * Get available audit actions for filtering
 */
router.get(
  '/organizations/:orgId/audit-logs/actions',
  requireAuth,
  requirePermission(Permission.AUDIT_VIEW),
  async (req, res, next) => {
    try {
      const { orgId } = req.params;

      // Ensure user can only access audit logs for their organization
      if (req.organizationId !== orgId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to organization audit logs',
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const actions = await auditService.getAvailableActions(orgId!);

      return res.json({ actions });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /organizations/:orgId/audit-logs/entity-types
 * Get available entity types for filtering
 */
router.get(
  '/organizations/:orgId/audit-logs/entity-types',
  requireAuth,
  requirePermission(Permission.AUDIT_VIEW),
  async (req, res, next) => {
    try {
      const { orgId } = req.params;

      // Ensure user can only access audit logs for their organization
      if (req.organizationId !== orgId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to organization audit logs',
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const entityTypes = await auditService.getAvailableEntityTypes(orgId!);

      return res.json({ entityTypes });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;