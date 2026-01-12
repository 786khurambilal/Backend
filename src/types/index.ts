// Core entity types
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  settings: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSettings {
  allowPublicSignup: boolean;
  defaultRole: Role;
  [key: string]: unknown;
}

export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: Role;
  status: MembershipStatus;
  invitedBy?: string;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  userId: string;
  addedBy: string;
  createdAt: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  isRevoked: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: Date;
  invitedBy: string;
  acceptedAt?: Date;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: object;
  afterJson?: object;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

export interface DebugRoute {
  id: string;
  routePattern: string;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ErrorLog {
  id: string;
  organizationId?: string | undefined;
  requestId: string;
  route: string;
  method: string;
  statusCode: number;
  errorMessage: string;
  errorStack?: string | undefined;
  metaJson?: object | undefined;
  createdAt: Date;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export interface EmailVerificationToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

// Enums
export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export enum Permission {
  // Organization permissions
  ORG_MANAGE = 'org:manage',
  ORG_VIEW = 'org:view',
  ORG_TRANSFER = 'org:transfer',

  // Member permissions
  MEMBER_INVITE = 'member:invite',
  MEMBER_MANAGE = 'member:manage',
  MEMBER_VIEW = 'member:view',

  // Team permissions
  TEAM_CREATE = 'team:create',
  TEAM_MANAGE = 'team:manage',
  TEAM_VIEW = 'team:view',

  // Audit permissions
  AUDIT_VIEW = 'audit:view',

  // Debug permissions
  DEBUG_MANAGE = 'debug:manage',
}

export enum MembershipStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

// Request/Response types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TenantContext {
  organizationId: string;
  userId: string;
  userRole: Role;
  permissions: Permission[];
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: object;
    requestId: string;
    timestamp: string;
  };
}

// Utility types
export type CreateUserData = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateOrganizationData = Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateTeamData = Omit<Team, 'id' | 'createdAt' | 'updatedAt'>;

// Pagination types
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Express Request extensions
declare global {
  namespace Express {
    interface Request {
      id?: string;
      userId?: string;
      user?: User;
      organizationId?: string;
      userRole?: Role;
      permissions?: Permission[];
    }
  }
}