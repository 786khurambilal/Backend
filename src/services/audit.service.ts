import { Knex } from 'knex';
import { AuditLog, PaginatedResponse, PaginationParams } from '../types';
import { db } from '../database/connection';

export interface AuditContext {
  organizationId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: object | undefined;
  afterState?: object | undefined;
  ipAddress: string;
  userAgent: string;
}

export interface AuditFilters {
  actorUserId?: string | undefined;
  action?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

export class AuditService {
  private db: Knex;

  constructor() {
    this.db = db;
  }

  /**
   * Log an audit entry for a mutating action
   * Requirement 7.1: WHEN any mutating action occurs, THE System SHALL create an audit log entry
   * Requirement 7.2: THE System SHALL store audit logs with actor, action, entity details, before/after states, and metadata
   * Requirement 7.4: THE System SHALL include IP address and user agent information in audit logs
   */
  async logAction(context: AuditContext): Promise<AuditLog> {
    const auditLog = {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: context.action,
      entityType: context.entityType,
      entityId: context.entityId,
      beforeJson: context.beforeState || null,
      afterJson: context.afterState || null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    };

    const [insertedLog] = await this.db('audit_logs')
      .insert(auditLog)
      .returning('*');

    return this.mapDbRowToAuditLog(insertedLog);
  }

  /**
   * Get audit logs for an organization with filtering and pagination
   * Requirement 7.3: THE System SHALL provide filtered and paginated access to audit logs per organization
   * Requirement 7.5: THE System SHALL scope audit log access to organization boundaries
   */
  async getAuditLogs(
    organizationId: string,
    filters: AuditFilters = {},
    pagination: PaginationParams = { page: 1, limit: 50 }
  ): Promise<PaginatedResponse<AuditLog>> {
    const query = this.db('audit_logs')
      .where('organization_id', organizationId);

    // Apply filters
    if (filters.actorUserId) {
      query.where('actor_user_id', filters.actorUserId);
    }

    if (filters.action) {
      query.where('action', filters.action);
    }

    if (filters.entityType) {
      query.where('entity_type', filters.entityType);
    }

    if (filters.entityId) {
      query.where('entity_id', filters.entityId);
    }

    if (filters.startDate) {
      query.where('created_at', '>=', filters.startDate);
    }

    if (filters.endDate) {
      query.where('created_at', '<=', filters.endDate);
    }

    // Get total count for pagination
    const countQuery = query.clone();
    const countResult = await countQuery.count('* as count');
    const total = parseInt((countResult[0] as any).count as string, 10);

    // Apply pagination and sorting
    const offset = (pagination.page - 1) * pagination.limit;
    const sortBy = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';

    const logs = await query
      .orderBy(sortBy, sortOrder)
      .limit(pagination.limit)
      .offset(offset)
      .select('*');

    const mappedLogs = logs.map(log => this.mapDbRowToAuditLog(log));

    const totalPages = Math.ceil(total / pagination.limit);

    return {
      data: mappedLogs,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrev: pagination.page > 1,
      },
    };
  }

  /**
   * Get audit logs for a specific entity
   */
  async getEntityAuditLogs(
    organizationId: string,
    entityType: string,
    entityId: string,
    pagination: PaginationParams = { page: 1, limit: 50 }
  ): Promise<PaginatedResponse<AuditLog>> {
    return this.getAuditLogs(
      organizationId,
      { entityType, entityId },
      pagination
    );
  }

  /**
   * Get audit logs for a specific user's actions
   */
  async getUserAuditLogs(
    organizationId: string,
    actorUserId: string,
    pagination: PaginationParams = { page: 1, limit: 50 }
  ): Promise<PaginatedResponse<AuditLog>> {
    return this.getAuditLogs(
      organizationId,
      { actorUserId },
      pagination
    );
  }

  /**
   * Get available audit actions for filtering
   */
  async getAvailableActions(organizationId: string): Promise<string[]> {
    const actions = await this.db('audit_logs')
      .where('organization_id', organizationId)
      .distinct('action')
      .pluck('action');

    return actions.sort();
  }

  /**
   * Get available entity types for filtering
   */
  async getAvailableEntityTypes(organizationId: string): Promise<string[]> {
    const entityTypes = await this.db('audit_logs')
      .where('organization_id', organizationId)
      .distinct('entity_type')
      .pluck('entity_type');

    return entityTypes.sort();
  }

  /**
   * Map database row to AuditLog interface
   */
  private mapDbRowToAuditLog(row: any): AuditLog {
    return {
      id: row.id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      beforeJson: row.before_json,
      afterJson: row.after_json,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at),
    };
  }
}

// Export singleton instance
export const auditService = new AuditService();