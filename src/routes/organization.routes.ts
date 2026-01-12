import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { organizationService } from '../services/organization.service';
import { auditService } from '../services/audit.service';
import { 
  requireAuth, 
  requireOrgMembership, 
  requireOrgPermission,
  requireOrgRole 
} from '../middleware/auth.middleware';
import { 
  validateRequest, 
  organizationSchemas, 
  commonSchemas 
} from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { Role, Permission } from '../types';

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Organization management endpoints
 */

const router = Router();

/**
 * @swagger
 * /organizations:
 *   post:
 *     summary: Create a new organization
 *     description: Creates a new organization with the authenticated user as the owner
 *     tags: [Organizations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrganizationRequest'
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Organization'
 *                     message:
 *                       type: string
 *                       example: 'Organization created successfully'
 *       400:
 *         description: Validation error or organization slug already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     summary: Get user's organizations
 *     description: Returns all organizations the authenticated user is a member of
 *     tags: [Organizations]
 *     responses:
 *       200:
 *         description: Organizations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         allOf:
 *                           - $ref: '#/components/schemas/Organization'
 *                           - type: object
 *                             properties:
 *                               membership:
 *                                 $ref: '#/components/schemas/Membership'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', 
  requireAuth,
  validateRequest({ body: organizationSchemas.create }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    const organization = await organizationService.createOrganization(req.userId!, req.body);

    res.status(201).json({
      success: true,
      data: organization,
      message: 'Organization created successfully',
    });
  })
);

/**
 * GET /organizations
 * Get user's organizations
 */
router.get('/', 
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    const organizations = await organizationService.getUserOrganizations(req.userId!);

    res.json({
      success: true,
      data: organizations,
    });
  })
);

/**
 * GET /organizations/:orgId
 * Get organization details
 */
router.get('/:orgId', 
  requireAuth,
  requireOrgMembership('orgId'),
  validateRequest({ params: commonSchemas.orgIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const organization = await organizationService.getOrganizationById(req.params['orgId']!);

    if (!organization) {
      throw new Error('Organization not found');
    }

    res.json({
      success: true,
      data: organization,
    });
  })
);

/**
 * PUT /organizations/:orgId
 * Update organization
 */
router.put('/:orgId', 
  requireAuth,
  requireOrgPermission('orgId', Permission.ORG_MANAGE),
  validateRequest({ 
    params: commonSchemas.orgIdParam,
    body: organizationSchemas.update 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const organization = await organizationService.updateOrganization(
      req.params['orgId']!, 
      req.body
    );

    res.json({
      success: true,
      data: organization,
      message: 'Organization updated successfully',
    });
  })
);

/**
 * DELETE /organizations/:orgId
 * Delete organization
 */
router.delete('/:orgId', 
  requireAuth,
  requireOrgRole('orgId', Role.OWNER),
  validateRequest({ params: commonSchemas.orgIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    await organizationService.deleteOrganization(req.params['orgId']!);

    res.json({
      success: true,
      message: 'Organization deleted successfully',
    });
  })
);

/**
 * POST /organizations/:orgId/invite
 * Invite user to organization
 */
router.post('/:orgId/invite', 
  requireAuth,
  requireOrgPermission('orgId', Permission.MEMBER_INVITE),
  validateRequest({ 
    params: commonSchemas.orgIdParam,
    body: z.object({
      email: commonSchemas.email,
      role: z.nativeEnum(Role),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    const invitation = await organizationService.inviteUser(
      req.params['orgId']!,
      req.userId!,
      req.body
    );

    res.status(201).json({
      success: true,
      data: invitation,
      message: 'User invited successfully',
    });
  })
);

/**
 * POST /organizations/accept-invitation
 * Accept organization invitation
 */
router.post('/accept-invitation', 
  requireAuth,
  validateRequest({ 
    body: z.object({
      token: commonSchemas.token,
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const membership = await organizationService.acceptInvitation(req.body.token);

    res.json({
      success: true,
      data: membership,
      message: 'Invitation accepted successfully',
    });
  })
);

/**
 * GET /organizations/:orgId/members
 * Get organization members
 */
router.get('/:orgId/members', 
  requireAuth,
  requireOrgPermission('orgId', Permission.MEMBER_VIEW),
  validateRequest({ 
    params: commonSchemas.orgIdParam,
    query: z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      sortBy: z.enum(['joinedAt', 'role', 'email']).default('joinedAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }).partial()
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const members = await organizationService.getOrganizationMembers(
      req.params['orgId']!,
      req.query as any
    );

    res.json({
      success: true,
      data: members.data,
      pagination: members.pagination,
    });
  })
);

/**
 * PUT /organizations/:orgId/members/:userId
 * Update member role
 */
router.put('/:orgId/members/:userId', 
  requireAuth,
  requireOrgPermission('orgId', Permission.MEMBER_MANAGE),
  validateRequest({ 
    params: z.object({
      orgId: z.string().uuid('Invalid organization ID format'),
      userId: z.string().uuid('Invalid user ID format'),
    }),
    body: z.object({
      role: z.nativeEnum(Role),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const membership = await organizationService.updateMemberRole(
      req.params['orgId']!,
      req.params['userId']!,
      req.body
    );

    res.json({
      success: true,
      data: membership,
      message: 'Member role updated successfully',
    });
  })
);

/**
 * DELETE /organizations/:orgId/members/:userId
 * Remove member from organization
 */
router.delete('/:orgId/members/:userId', 
  requireAuth,
  requireOrgPermission('orgId', Permission.MEMBER_MANAGE),
  validateRequest({ 
    params: z.object({
      orgId: z.string().uuid('Invalid organization ID format'),
      userId: z.string().uuid('Invalid user ID format'),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    await organizationService.removeMember(req.params['orgId']!, req.params['userId']!);

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  })
);

/**
 * POST /organizations/:orgId/transfer-ownership
 * Transfer organization ownership
 */
router.post('/:orgId/transfer-ownership', 
  requireAuth,
  requireOrgRole('orgId', Role.OWNER),
  validateRequest({ 
    params: commonSchemas.orgIdParam,
    body: z.object({
      newOwnerId: z.string().uuid('Invalid user ID format'),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    await organizationService.transferOwnership(req.params['orgId']!, req.body);

    res.json({
      success: true,
      message: 'Ownership transferred successfully',
    });
  })
);

/**
 * @swagger
 * /organizations/{orgId}/audit-logs:
 *   get:
 *     summary: Get organization audit logs
 *     description: Returns audit logs for the specified organization with filtering and pagination
 *     tags: [Organizations]
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
 *         description: Page number for pagination
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
 *           enum: [createdAt, action, entityType, actorUserId]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
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
 *         description: Filter by start date (ISO 8601 format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date (ISO 8601 format)
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AuditLog'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationInfo'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Insufficient permissions (requires audit:view)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:orgId/audit-logs', 
  requireAuth,
  requireOrgPermission('orgId', Permission.AUDIT_VIEW),
  validateRequest({ 
    params: commonSchemas.orgIdParam,
    query: z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(50),
      sortBy: z.enum(['createdAt', 'action', 'entityType', 'actorUserId']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      actorUserId: z.string().uuid().optional(),
      action: z.string().optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }).partial()
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.params;
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      actorUserId,
      action,
      entityType,
      entityId,
      startDate,
      endDate,
    } = req.query as any;

    const filters = {
      actorUserId,
      action,
      entityType,
      entityId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const pagination = {
      page,
      limit,
      sortBy,
      sortOrder,
    };

    const result = await auditService.getAuditLogs(orgId!, filters, pagination);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  })
);

export { router as organizationRoutes };