import { Router } from 'express';
import { z } from 'zod';
import { debugRouteService } from '../services/debug-route.service';
import { errorLogService, ErrorLogFilters } from '../services/error-log.service';
import { requireAuth } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/auth.middleware';
import { Permission, PaginationParams } from '../types';
import { asyncHandler } from '../middleware/error.middleware';
import { ValidationError, NotFoundError } from '../middleware/error.middleware';

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Administrative endpoints for debug logging and error management
 */

const router = Router();

// All admin routes require authentication and debug management permission
router.use(requireAuth);
router.use(requirePermission(Permission.DEBUG_MANAGE));

// Validation schemas
const createDebugRouteSchema = z.object({
  routePattern: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
});

const updateDebugRouteSchema = z.object({
  enabled: z.boolean(),
});

const errorLogFiltersSchema = z.object({
  organizationId: z.string().uuid().optional(),
  route: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  minStatusCode: z.number().int().min(100).max(599).optional(),
  maxStatusCode: z.number().int().min(100).max(599).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  requestId: z.string().optional(),
});

const paginationSchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().min(1)).default('1'),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('50'),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * @swagger
 * /admin/debug-routes:
 *   get:
 *     summary: List all debug route configurations
 *     description: Returns all debug route configurations for administrative management
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Debug routes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DebugRoute'
 *                 total:
 *                   type: integer
 *                   example: 5
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Insufficient permissions (requires debug:manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Create a new debug route configuration
 *     description: Creates a new debug route configuration to enable detailed logging for specific routes
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDebugRouteRequest'
 *     responses:
 *       201:
 *         description: Debug route configuration created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/DebugRoute'
 *                 message:
 *                   type: string
 *                   example: 'Debug route configuration created successfully'
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
 *         description: Insufficient permissions (requires debug:manage)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/debug-routes', asyncHandler(async (_req, res) => {
  const debugRoutes = await debugRouteService.getAllDebugRoutes();
  
  res.json({
    data: debugRoutes,
    total: debugRoutes.length,
  });
}));

/**
 * POST /admin/debug-routes
 * Create a new debug route configuration
 */
router.post('/debug-routes', asyncHandler(async (req, res) => {
  const validation = createDebugRouteSchema.safeParse(req.body);
  
  if (!validation.success) {
    throw new ValidationError('Invalid request data', validation.error.errors);
  }

  const { routePattern, enabled } = validation.data;
  
  const debugRoute = await debugRouteService.createDebugRoute(
    routePattern,
    enabled,
    req.userId!
  );

  res.status(201).json({
    data: debugRoute,
    message: 'Debug route configuration created successfully',
  });
}));

/**
 * PUT /admin/debug-routes/:id
 * Update debug route configuration
 */
router.put('/debug-routes/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('Debug route ID is required');
  }

  const validation = updateDebugRouteSchema.safeParse(req.body);
  
  if (!validation.success) {
    throw new ValidationError('Invalid request data', validation.error.errors);
  }

  const { enabled } = validation.data;
  
  const debugRoute = await debugRouteService.updateDebugRoute(id, enabled);
  
  if (!debugRoute) {
    throw new NotFoundError('Debug route configuration not found');
  }

  res.json({
    data: debugRoute,
    message: 'Debug route configuration updated successfully',
  });
}));

/**
 * DELETE /admin/debug-routes/:id
 * Delete debug route configuration
 */
router.delete('/debug-routes/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('Debug route ID is required');
  }

  const deleted = await debugRouteService.deleteDebugRoute(id);
  
  if (!deleted) {
    throw new NotFoundError('Debug route configuration not found');
  }

  res.json({
    message: 'Debug route configuration deleted successfully',
  });
}));

/**
 * POST /admin/debug-routes/refresh
 * Refresh debug routes cache
 */
router.post('/debug-routes/refresh', asyncHandler(async (_req, res) => {
  await debugRouteService.refreshCache();
  
  res.json({
    message: 'Debug routes cache refreshed successfully',
  });
}));

/**
 * GET /admin/error-logs
 * Get error logs with filtering and pagination
 */
router.get('/error-logs', asyncHandler(async (req, res) => {
  const filtersValidation = errorLogFiltersSchema.safeParse(req.query);
  const paginationValidation = paginationSchema.safeParse(req.query);
  
  if (!filtersValidation.success) {
    throw new ValidationError('Invalid filter parameters', filtersValidation.error.errors);
  }
  
  if (!paginationValidation.success) {
    throw new ValidationError('Invalid pagination parameters', paginationValidation.error.errors);
  }

  const filters: ErrorLogFilters = {
    organizationId: filtersValidation.data.organizationId,
    route: filtersValidation.data.route,
    method: filtersValidation.data.method,
    statusCode: filtersValidation.data.statusCode,
    minStatusCode: filtersValidation.data.minStatusCode,
    maxStatusCode: filtersValidation.data.maxStatusCode,
    requestId: filtersValidation.data.requestId,
    startDate: filtersValidation.data.startDate ? new Date(filtersValidation.data.startDate) : undefined,
    endDate: filtersValidation.data.endDate ? new Date(filtersValidation.data.endDate) : undefined,
  };

  const pagination: PaginationParams = {
    page: paginationValidation.data.page,
    limit: paginationValidation.data.limit,
    sortBy: paginationValidation.data.sortBy,
    sortOrder: paginationValidation.data.sortOrder,
  };

  const result = await errorLogService.getErrorLogs(filters, pagination);
  
  res.json(result);
}));

/**
 * GET /admin/error-logs/:id
 * Get specific error log by ID
 */
router.get('/error-logs/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('Error log ID is required');
  }

  const errorLog = await errorLogService.getErrorLogById(id);
  
  if (!errorLog) {
    throw new NotFoundError('Error log not found');
  }

  res.json({
    data: errorLog,
  });
}));

/**
 * GET /admin/error-logs/request/:requestId
 * Get error logs by request ID (correlation)
 */
router.get('/error-logs/request/:requestId', asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  
  if (!requestId) {
    throw new ValidationError('Request ID is required');
  }

  const errorLogs = await errorLogService.getErrorLogsByRequestId(requestId);
  
  res.json({
    data: errorLogs,
    total: errorLogs.length,
  });
}));

/**
 * GET /admin/error-logs/statistics
 * Get error statistics
 */
router.get('/error-logs/statistics', asyncHandler(async (req, res) => {
  const { organizationId, startDate, endDate } = req.query;
  
  const filters = {
    organizationId: organizationId as string | undefined,
    startDate: startDate ? new Date(startDate as string) : undefined,
    endDate: endDate ? new Date(endDate as string) : undefined,
  };

  const statistics = await errorLogService.getErrorStatistics(
    filters.organizationId,
    filters.startDate,
    filters.endDate
  );
  
  res.json({
    data: statistics,
  });
}));

/**
 * DELETE /admin/error-logs/cleanup
 * Delete old error logs (cleanup)
 */
router.delete('/error-logs/cleanup', asyncHandler(async (req, res) => {
  const { olderThanDays } = req.query;
  
  const days = olderThanDays ? parseInt(olderThanDays as string, 10) : 30;
  
  if (isNaN(days) || days < 1) {
    throw new ValidationError('olderThanDays must be a positive number');
  }

  const deletedCount = await errorLogService.deleteOldErrorLogs(days);
  
  res.json({
    message: `Deleted ${deletedCount} old error logs`,
    deletedCount,
  });
}));

export { router as adminRoutes };