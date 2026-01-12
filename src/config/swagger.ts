import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Multi-Tenant SaaS Backend API',
      version: '1.0.0',
      description: 'Production-ready multi-tenant SaaS backend engine with comprehensive user management, authentication, authorization, and audit capabilities.',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: env.NODE_ENV === 'production' ? 'https://api.example.com' : `http://localhost:${env.PORT}`,
        description: env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token for authentication',
        },
      },
      schemas: {
        // Error Response Schema
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  description: 'Human-readable error message',
                  example: 'Invalid input data',
                },
                details: {
                  type: 'object',
                  description: 'Additional error details',
                },
                requestId: {
                  type: 'string',
                  description: 'Unique request identifier for tracing',
                  example: 'req_123456789',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Error timestamp',
                  example: '2024-01-01T00:00:00.000Z',
                },
              },
              required: ['code', 'message', 'requestId', 'timestamp'],
            },
          },
          required: ['error'],
        },

        // Success Response Schema
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              description: 'Response data',
            },
            message: {
              type: 'string',
              description: 'Success message',
              example: 'Operation completed successfully',
            },
          },
          required: ['success'],
        },

        // Pagination Schema
        PaginationMeta: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
              description: 'Current page number',
              example: 1,
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Number of items per page',
              example: 20,
            },
            total: {
              type: 'integer',
              minimum: 0,
              description: 'Total number of items',
              example: 100,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
              description: 'Total number of pages',
              example: 5,
            },
            hasNext: {
              type: 'boolean',
              description: 'Whether there is a next page',
              example: true,
            },
            hasPrev: {
              type: 'boolean',
              description: 'Whether there is a previous page',
              example: false,
            },
          },
          required: ['page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev'],
        },

        PaginationInfo: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
              description: 'Current page number',
              example: 1,
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Number of items per page',
              example: 20,
            },
            total: {
              type: 'integer',
              minimum: 0,
              description: 'Total number of items',
              example: 100,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
              description: 'Total number of pages',
              example: 5,
            },
            hasNext: {
              type: 'boolean',
              description: 'Whether there is a next page',
              example: true,
            },
            hasPrev: {
              type: 'boolean',
              description: 'Whether there is a previous page',
              example: false,
            },
          },
          required: ['page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev'],
        },

        // User Schema
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique user identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
            firstName: {
              type: 'string',
              description: 'User first name',
              example: 'John',
            },
            lastName: {
              type: 'string',
              description: 'User last name',
              example: 'Doe',
            },
            isEmailVerified: {
              type: 'boolean',
              description: 'Whether user email is verified',
              example: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'User creation timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'User last update timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['id', 'email', 'firstName', 'lastName', 'isEmailVerified', 'createdAt', 'updatedAt'],
        },

        // Organization Schema
        Organization: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique organization identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            name: {
              type: 'string',
              description: 'Organization name',
              example: 'Acme Corporation',
            },
            slug: {
              type: 'string',
              description: 'Organization URL slug',
              example: 'acme-corp',
            },
            ownerId: {
              type: 'string',
              format: 'uuid',
              description: 'Organization owner user ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            settings: {
              $ref: '#/components/schemas/OrganizationSettings',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Organization creation timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Organization last update timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['id', 'name', 'slug', 'ownerId', 'settings', 'createdAt', 'updatedAt'],
        },

        // Organization Settings Schema
        OrganizationSettings: {
          type: 'object',
          properties: {
            allowPublicSignup: {
              type: 'boolean',
              description: 'Whether public signup is allowed',
              example: false,
            },
            defaultRole: {
              $ref: '#/components/schemas/Role',
            },
          },
          required: ['allowPublicSignup', 'defaultRole'],
          additionalProperties: true,
        },

        // Team Schema
        Team: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique team identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            organizationId: {
              type: 'string',
              format: 'uuid',
              description: 'Organization ID this team belongs to',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            name: {
              type: 'string',
              description: 'Team name',
              example: 'Engineering Team',
            },
            description: {
              type: 'string',
              nullable: true,
              description: 'Team description',
              example: 'Software development team',
            },
            createdBy: {
              type: 'string',
              format: 'uuid',
              description: 'User ID who created the team',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Team creation timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Team last update timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['id', 'organizationId', 'name', 'createdBy', 'createdAt', 'updatedAt'],
        },

        // Membership Schema
        Membership: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique membership identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'User ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            organizationId: {
              type: 'string',
              format: 'uuid',
              description: 'Organization ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            role: {
              $ref: '#/components/schemas/Role',
            },
            status: {
              $ref: '#/components/schemas/MembershipStatus',
            },
            invitedBy: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'User ID who sent the invitation',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            joinedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When the user joined the organization',
              example: '2024-01-01T00:00:00.000Z',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Membership creation timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Membership last update timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['id', 'userId', 'organizationId', 'role', 'status', 'createdAt', 'updatedAt'],
        },

        // Audit Log Schema
        AuditLog: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique audit log identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            organizationId: {
              type: 'string',
              format: 'uuid',
              description: 'Organization ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            actorUserId: {
              type: 'string',
              format: 'uuid',
              description: 'User ID who performed the action',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            action: {
              type: 'string',
              description: 'Action performed',
              example: 'CREATE_TEAM',
            },
            entityType: {
              type: 'string',
              description: 'Type of entity affected',
              example: 'Team',
            },
            entityId: {
              type: 'string',
              format: 'uuid',
              description: 'ID of the affected entity',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            beforeJson: {
              type: 'object',
              nullable: true,
              description: 'Entity state before the action',
            },
            afterJson: {
              type: 'object',
              nullable: true,
              description: 'Entity state after the action',
            },
            ipAddress: {
              type: 'string',
              description: 'IP address of the actor',
              example: '192.168.1.1',
            },
            userAgent: {
              type: 'string',
              description: 'User agent of the actor',
              example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Audit log creation timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['id', 'organizationId', 'actorUserId', 'action', 'entityType', 'entityId', 'ipAddress', 'userAgent', 'createdAt'],
        },

        // Auth Tokens Schema
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              description: 'JWT access token',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              description: 'JWT refresh token',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            expiresIn: {
              type: 'integer',
              description: 'Access token expiration time in seconds',
              example: 3600,
            },
          },
          required: ['accessToken', 'refreshToken', 'expiresIn'],
        },

        // Enums
        Role: {
          type: 'string',
          enum: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'],
          description: 'User role within an organization',
          example: 'MEMBER',
        },

        MembershipStatus: {
          type: 'string',
          enum: ['PENDING', 'ACTIVE', 'SUSPENDED'],
          description: 'Status of organization membership',
          example: 'ACTIVE',
        },

        Permission: {
          type: 'string',
          enum: [
            'org:manage',
            'org:view',
            'org:transfer',
            'member:invite',
            'member:manage',
            'member:view',
            'team:create',
            'team:manage',
            'team:view',
            'audit:view',
            'debug:manage',
          ],
          description: 'Permission within an organization',
          example: 'team:view',
        },

        // Request Schemas
        LoginRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              minLength: 8,
              description: 'User password',
              example: 'securePassword123',
            },
          },
          required: ['email', 'password'],
        },

        RegisterRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              minLength: 8,
              description: 'User password',
              example: 'securePassword123',
            },
            firstName: {
              type: 'string',
              minLength: 1,
              maxLength: 50,
              description: 'User first name',
              example: 'John',
            },
            lastName: {
              type: 'string',
              minLength: 1,
              maxLength: 50,
              description: 'User last name',
              example: 'Doe',
            },
          },
          required: ['email', 'password', 'firstName', 'lastName'],
        },

        RefreshTokenRequest: {
          type: 'object',
          properties: {
            refreshToken: {
              type: 'string',
              description: 'JWT refresh token',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
          required: ['refreshToken'],
        },

        ForgotPasswordRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
          },
          required: ['email'],
        },

        ResetPasswordRequest: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Password reset token',
              example: 'reset_token_123456',
            },
            password: {
              type: 'string',
              minLength: 8,
              description: 'New password',
              example: 'newSecurePassword123',
            },
          },
          required: ['token', 'password'],
        },

        ChangePasswordRequest: {
          type: 'object',
          properties: {
            currentPassword: {
              type: 'string',
              description: 'Current password',
              example: 'currentPassword123',
            },
            newPassword: {
              type: 'string',
              minLength: 8,
              description: 'New password',
              example: 'newSecurePassword123',
            },
          },
          required: ['currentPassword', 'newPassword'],
        },

        CreateOrganizationRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Organization name',
              example: 'Acme Corporation',
            },
            slug: {
              type: 'string',
              pattern: '^[a-z0-9-]+$',
              minLength: 1,
              maxLength: 50,
              description: 'Organization URL slug',
              example: 'acme-corp',
            },
          },
          required: ['name', 'slug'],
        },

        UpdateOrganizationRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Organization name',
              example: 'Acme Corporation Updated',
            },
            settings: {
              $ref: '#/components/schemas/OrganizationSettings',
            },
          },
        },

        CreateTeamRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Team name',
              example: 'Engineering Team',
            },
            description: {
              type: 'string',
              maxLength: 500,
              description: 'Team description',
              example: 'Software development team',
            },
          },
          required: ['name'],
        },

        UpdateTeamRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Team name',
              example: 'Engineering Team Updated',
            },
            description: {
              type: 'string',
              maxLength: 500,
              description: 'Team description',
              example: 'Updated software development team',
            },
          },
        },

        InviteUserRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Email address of user to invite',
              example: 'newuser@example.com',
            },
            role: {
              $ref: '#/components/schemas/Role',
            },
          },
          required: ['email', 'role'],
        },

        UpdateMemberRoleRequest: {
          type: 'object',
          properties: {
            role: {
              $ref: '#/components/schemas/Role',
            },
          },
          required: ['role'],
        },

        TransferOwnershipRequest: {
          type: 'object',
          properties: {
            newOwnerId: {
              type: 'string',
              format: 'uuid',
              description: 'User ID of the new owner',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
          },
          required: ['newOwnerId'],
        },

        AddTeamMemberRequest: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'User ID to add to the team',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
          },
          required: ['userId'],
        },

        AcceptInvitationRequest: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Invitation token',
              example: 'invitation_token_123456',
            },
          },
          required: ['token'],
        },

        VerifyEmailRequest: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Email verification token',
              example: 'verification_token_123456',
            },
          },
          required: ['token'],
        },

        // Response Schemas
        PaginatedUsersResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/User',
                  },
                },
                pagination: {
                  $ref: '#/components/schemas/PaginationMeta',
                },
              },
            },
          ],
        },

        PaginatedOrganizationsResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Organization',
                  },
                },
                pagination: {
                  $ref: '#/components/schemas/PaginationMeta',
                },
              },
            },
          ],
        },

        PaginatedTeamsResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Team',
                  },
                },
                pagination: {
                  $ref: '#/components/schemas/PaginationMeta',
                },
              },
            },
          ],
        },

        PaginatedAuditLogsResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/AuditLog',
                  },
                },
                pagination: {
                  $ref: '#/components/schemas/PaginationMeta',
                },
              },
            },
          ],
        },

        // Debug and Admin Schemas
        DebugRoute: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique debug route identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            routePattern: {
              type: 'string',
              description: 'Route pattern for debug logging',
              example: '/api/users/*',
            },
            enabled: {
              type: 'boolean',
              description: 'Whether debug logging is enabled for this route',
              example: true,
            },
            createdBy: {
              type: 'string',
              format: 'uuid',
              description: 'User ID who created this debug route',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Debug route creation timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Debug route last update timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['id', 'routePattern', 'enabled', 'createdBy', 'createdAt', 'updatedAt'],
        },

        ErrorLog: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique error log identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            organizationId: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'Organization ID (if applicable)',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            requestId: {
              type: 'string',
              description: 'Request correlation ID',
              example: 'req_123456789',
            },
            route: {
              type: 'string',
              description: 'API route where error occurred',
              example: '/api/users/profile',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
              description: 'HTTP method',
              example: 'POST',
            },
            statusCode: {
              type: 'integer',
              minimum: 100,
              maximum: 599,
              description: 'HTTP status code',
              example: 500,
            },
            errorMessage: {
              type: 'string',
              description: 'Error message',
              example: 'Internal server error',
            },
            errorStack: {
              type: 'string',
              nullable: true,
              description: 'Error stack trace',
            },
            metaJson: {
              type: 'object',
              nullable: true,
              description: 'Additional error metadata',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Error log creation timestamp',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['id', 'requestId', 'route', 'method', 'statusCode', 'errorMessage', 'createdAt'],
        },

        CreateDebugRouteRequest: {
          type: 'object',
          properties: {
            routePattern: {
              type: 'string',
              minLength: 1,
              maxLength: 255,
              description: 'Route pattern for debug logging',
              example: '/api/users/*',
            },
            enabled: {
              type: 'boolean',
              default: true,
              description: 'Whether debug logging should be enabled',
              example: true,
            },
          },
          required: ['routePattern'],
        },

        UpdateDebugRouteRequest: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Whether debug logging should be enabled',
              example: false,
            },
          },
          required: ['enabled'],
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts', // Path to the API routes
    './src/app.ts', // Path to main app file for health endpoint
  ],
};

export const swaggerSpec = swaggerJSDoc(options);