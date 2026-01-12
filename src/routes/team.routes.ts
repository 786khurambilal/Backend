import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { teamService } from '../services/team.service';
import { 
  requireAuth, 
  requireOrgPermission 
} from '../middleware/auth.middleware';
import { 
  validateRequest, 
  teamSchemas, 
  commonSchemas 
} from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { Permission } from '../types';

/**
 * @swagger
 * tags:
 *   name: Teams
 *   description: Team management endpoints within organizations
 */

const router = Router();

/**
 * @swagger
 * /organizations/{orgId}/teams:
 *   post:
 *     summary: Create a new team within an organization
 *     description: Creates a new team within the specified organization
 *     tags: [Teams]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTeamRequest'
 *     responses:
 *       201:
 *         description: Team created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Team'
 *                     message:
 *                       type: string
 *                       example: 'Team created successfully'
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
 *         description: Insufficient permissions (requires team:create)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     summary: Get teams for an organization
 *     description: Returns paginated list of teams within the specified organization
 *     tags: [Teams]
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
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, name, memberCount]
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
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search teams by name
 *     responses:
 *       200:
 *         description: Teams retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedTeamsResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Insufficient permissions (requires team:view)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:orgId/teams', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_CREATE),
  validateRequest({ 
    params: commonSchemas.orgIdParam,
    body: teamSchemas.create 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    const team = await teamService.createTeam(
      req.params['orgId']!,
      req.userId!,
      req.body
    );

    res.status(201).json({
      success: true,
      data: team,
      message: 'Team created successfully',
    });
  })
);

/**
 * GET /organizations/:orgId/teams
 * Get teams for an organization
 */
router.get('/:orgId/teams', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_VIEW),
  validateRequest({ 
    params: commonSchemas.orgIdParam,
    query: z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      sortBy: z.enum(['createdAt', 'name', 'memberCount']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      search: z.string().min(1).max(100).optional(),
    }).partial()
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { search, ...pagination } = req.query as any;

    let teams;
    if (search) {
      teams = await teamService.searchTeams(
        req.params['orgId']!,
        search,
        pagination
      );
    } else {
      teams = await teamService.getOrganizationTeams(
        req.params['orgId']!,
        pagination
      );
    }

    res.json({
      success: true,
      data: teams.data,
      pagination: teams.pagination,
    });
  })
);

/**
 * GET /organizations/:orgId/teams/:teamId
 * Get team details
 */
router.get('/:orgId/teams/:teamId', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_VIEW),
  validateRequest({ 
    params: z.object({
      orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
      teamId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid team ID format'),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const team = await teamService.getTeamById(req.params['teamId']!);

    if (!team) {
      throw new Error('Team not found');
    }

    // Verify team belongs to the organization
    if (team.organizationId !== req.params['orgId']) {
      throw new Error('Team not found in this organization');
    }

    res.json({
      success: true,
      data: team,
    });
  })
);

/**
 * PUT /organizations/:orgId/teams/:teamId
 * Update team
 */
router.put('/:orgId/teams/:teamId', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_MANAGE),
  validateRequest({ 
    params: z.object({
      orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
      teamId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid team ID format'),
    }),
    body: teamSchemas.update 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    // Verify team exists and belongs to organization
    const team = await teamService.getTeamById(req.params['teamId']!);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.organizationId !== req.params['orgId']) {
      throw new Error('Team not found in this organization');
    }

    const updatedTeam = await teamService.updateTeam(
      req.params['teamId']!,
      req.body
    );

    res.json({
      success: true,
      data: updatedTeam,
      message: 'Team updated successfully',
    });
  })
);

/**
 * DELETE /organizations/:orgId/teams/:teamId
 * Delete team
 */
router.delete('/:orgId/teams/:teamId', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_MANAGE),
  validateRequest({ 
    params: z.object({
      orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
      teamId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid team ID format'),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    // Verify team exists and belongs to organization
    const team = await teamService.getTeamById(req.params['teamId']!);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.organizationId !== req.params['orgId']) {
      throw new Error('Team not found in this organization');
    }

    await teamService.deleteTeam(req.params['teamId']!);

    res.json({
      success: true,
      message: 'Team deleted successfully',
    });
  })
);

/**
 * POST /organizations/:orgId/teams/:teamId/members
 * Add member to team
 */
router.post('/:orgId/teams/:teamId/members', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_MANAGE),
  validateRequest({ 
    params: z.object({
      orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
      teamId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid team ID format'),
    }),
    body: teamSchemas.addMember
  }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      throw new Error('Authentication required');
    }

    // Verify team exists and belongs to organization
    const team = await teamService.getTeamById(req.params['teamId']!);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.organizationId !== req.params['orgId']) {
      throw new Error('Team not found in this organization');
    }

    const teamMembership = await teamService.addTeamMember(
      req.params['teamId']!,
      req.body.userId,
      req.userId!
    );

    res.status(201).json({
      success: true,
      data: teamMembership,
      message: 'Member added to team successfully',
    });
  })
);

/**
 * GET /organizations/:orgId/teams/:teamId/members
 * Get team members
 */
router.get('/:orgId/teams/:teamId/members', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_VIEW),
  validateRequest({ 
    params: z.object({
      orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
      teamId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid team ID format'),
    }),
    query: z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      sortBy: z.enum(['createdAt', 'email', 'firstName']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }).partial()
  }),
  asyncHandler(async (req: Request, res: Response) => {
    // Verify team exists and belongs to organization
    const team = await teamService.getTeamById(req.params['teamId']!);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.organizationId !== req.params['orgId']) {
      throw new Error('Team not found in this organization');
    }

    const members = await teamService.getTeamMembers(
      req.params['teamId']!,
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
 * DELETE /organizations/:orgId/teams/:teamId/members/:userId
 * Remove member from team
 */
router.delete('/:orgId/teams/:teamId/members/:userId', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_MANAGE),
  validateRequest({ 
    params: z.object({
      orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
      teamId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid team ID format'),
      userId: z.string().uuid('Invalid user ID format'),
    })
  }),
  asyncHandler(async (req: Request, res: Response) => {
    // Verify team exists and belongs to organization
    const team = await teamService.getTeamById(req.params['teamId']!);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.organizationId !== req.params['orgId']) {
      throw new Error('Team not found in this organization');
    }

    await teamService.removeTeamMember(
      req.params['teamId']!,
      req.params['userId']!
    );

    res.json({
      success: true,
      message: 'Member removed from team successfully',
    });
  })
);

/**
 * GET /organizations/:orgId/users/:userId/teams
 * Get teams for a user within an organization
 */
router.get('/:orgId/users/:userId/teams', 
  requireAuth,
  requireOrgPermission('orgId', Permission.TEAM_VIEW),
  validateRequest({ 
    params: z.object({
      orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
      userId: z.string().uuid('Invalid user ID format'),
    }),
    query: z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      sortBy: z.enum(['createdAt', 'name', 'memberCount']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }).partial()
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const teams = await teamService.getUserTeams(
      req.params['userId']!,
      req.params['orgId']!,
      req.query as any
    );

    res.json({
      success: true,
      data: teams.data,
      pagination: teams.pagination,
    });
  })
);

export { router as teamRoutes };