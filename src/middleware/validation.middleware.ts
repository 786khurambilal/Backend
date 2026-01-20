import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '../config/logger';

/**
 * Validation middleware factory
 * Creates middleware to validate request data against Zod schemas
 */
export function validateRequest(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request body
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      // Validate query parameters
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      // Validate route parameters
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({
          validationErrors: error.errors,
          path: req.path,
          method: req.method,
          ip: req.ip,
        }, 'Request validation failed');

        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            })),
            requestId: req.id?.toString() || 'unknown',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Unexpected error during validation
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown validation error',
        path: req.path,
        method: req.method,
      }, 'Unexpected validation error');

      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          requestId: req.id?.toString() || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // UUID parameter validation
  uuidParam: z.object({
    id: z.string().uuid('Invalid UUID format'),
  }),

  // Organization ID parameter validation (accepts both UUID and hex string formats)
  orgIdParam: z.object({
    orgId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/, 'Invalid organization ID format'),
  }),

  // Pagination query validation
  paginationQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Search query validation
  searchQuery: z.object({
    q: z.string().min(1).max(100).optional(),
    filter: z.string().optional(),
  }),

  // Email validation
  email: z.string().email('Invalid email format').toLowerCase(),

  // Password validation
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'),

  // Name validation
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters'),

  // Organization name validation
  organizationName: z.string()
    .min(1, 'Organization name is required')
    .max(100, 'Organization name must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_&.]+$/, 'Organization name contains invalid characters'),

  // Slug validation
  slug: z.string()
    .min(1, 'Slug is required')
    .max(50, 'Slug must not exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),

  // Role validation
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'], {
    errorMap: () => ({ message: 'Invalid role' }),
  }),

  // Team name validation
  teamName: z.string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Team name contains invalid characters'),

  // Description validation
  description: z.string()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),

  // Token validation
  token: z.string().min(1, 'Token is required'),

  // JWT token validation
  jwtToken: z.string()
    .min(1, 'Token is required')
    .regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, 'Invalid token format'),

  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),
};

/**
 * Authentication schemas
 */
export const authSchemas = {
  login: z.object({
    email: commonSchemas.email,
    password: z.string().min(1, 'Password is required'),
  }),

  register: z.object({
    email: commonSchemas.email,
    password: commonSchemas.password,
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
  }),

  refreshToken: z.object({
    refreshToken: commonSchemas.jwtToken,
  }),

  forgotPassword: z.object({
    email: commonSchemas.email,
  }),

  resetPassword: z.object({
    token: commonSchemas.token,
    password: commonSchemas.password,
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: commonSchemas.password,
  }),
};

/**
 * Organization schemas
 */
export const organizationSchemas = {
  create: z.object({
    name: commonSchemas.organizationName,
    slug: commonSchemas.slug.optional(),
    description: commonSchemas.description,
  }),

  update: z.object({
    name: commonSchemas.organizationName.optional(),
    description: commonSchemas.description,
  }),

  invite: z.object({
    email: commonSchemas.email,
    role: commonSchemas.role,
  }),

  updateMemberRole: z.object({
    role: commonSchemas.role,
  }),

  transferOwnership: z.object({
    newOwnerId: z.string().uuid('Invalid user ID format'),
  }),

  acceptInvitation: z.object({
    token: commonSchemas.token,
  }),
};

/**
 * Team schemas
 */
export const teamSchemas = {
  create: z.object({
    name: commonSchemas.teamName,
    description: commonSchemas.description,
  }),

  update: z.object({
    name: commonSchemas.teamName.optional(),
    description: commonSchemas.description,
  }),

  addMember: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
};

/**
 * Audit log schemas
 */
export const auditSchemas = {
  query: z.object({
    ...commonSchemas.paginationQuery.shape,
    action: z.string().optional(),
    entityType: z.string().optional(),
    actorUserId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};