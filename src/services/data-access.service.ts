import { Knex } from 'knex';
import { db } from '../database/connection';
import { logger } from '../config/logger';
import { TenantContext, PaginationParams, PaginatedResponse } from '../types';

/**
 * Multi-tenant data access service that provides organization-scoped queries
 * Ensures all data operations are properly isolated by organization
 */
export class DataAccessService {
  /**
   * Create an organization-scoped query builder
   * All queries created with this method will automatically include organization filtering
   */
  createOrganizationScopedQuery(
    tableName: string,
    organizationId: string,
    organizationColumn: string = 'organizationId'
  ): Knex.QueryBuilder {
    const query = db(tableName).where(organizationColumn, organizationId);
    
    logger.debug({
      tableName,
      organizationId,
      organizationColumn,
    }, 'Created organization-scoped query');

    return query;
  }

  /**
   * Execute a paginated organization-scoped query
   */
  async executePaginatedQuery<T extends Record<string, any>>(
    baseQuery: Knex.QueryBuilder,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<T>> {
    const { page = 1, limit = 20, sortBy, sortOrder = 'desc' } = pagination || {};
    const offset = (page - 1) * limit;

    // Clone the base query for counting
    const countQuery = baseQuery.clone().clearSelect().clearOrder().count('* as count');
    
    // Get total count
    const totalResult = await countQuery.first() as { count: number } | undefined;
    const total = totalResult?.count || 0;

    // Apply pagination and sorting to the main query
    let paginatedQuery = baseQuery.limit(limit).offset(offset);
    
    if (sortBy) {
      paginatedQuery = paginatedQuery.orderBy(sortBy, sortOrder);
    }

    // Execute the paginated query
    const data = await paginatedQuery as T[];

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Validate that a record belongs to the specified organization
   */
  async validateRecordOwnership<T extends Record<string, any>>(
    tableName: string,
    recordId: string,
    organizationId: string,
    organizationColumn: string = 'organizationId',
    idColumn: string = 'id'
  ): Promise<T | null> {
    try {
      const record = await db<T>(tableName)
        .where(idColumn, recordId)
        .where(organizationColumn, organizationId)
        .first();

      if (!record) {
        logger.warn({
          tableName,
          recordId,
          organizationId,
          organizationColumn,
          idColumn,
        }, 'Record not found or access denied');
        return null;
      }

      return record as T;
    } catch (error) {
      logger.error({
        error,
        tableName,
        recordId,
        organizationId,
      }, 'Failed to validate record ownership');
      return null;
    }
  }

  /**
   * Create a record with automatic organization scoping
   */
  async createOrganizationScopedRecord<T extends Record<string, any>>(
    tableName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
    organizationId: string,
    organizationColumn: string = 'organizationId'
  ): Promise<T> {
    const recordData = {
      ...data,
      [organizationColumn]: organizationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db(tableName).insert(recordData as any);

    // For MySQL, we need to get the inserted record
    // Since we're using UUIDs, we'll need to find it by unique constraints
    const insertedRecord = await db(tableName)
      .where(organizationColumn, organizationId)
      .orderBy('createdAt', 'desc')
      .first() as T;

    if (!insertedRecord) {
      throw new Error(`Failed to create record in ${tableName}`);
    }

    logger.info({
      tableName,
      organizationId,
      recordId: (insertedRecord as any).id,
    }, 'Organization-scoped record created');

    return insertedRecord;
  }

  /**
   * Update a record with organization ownership validation
   */
  async updateOrganizationScopedRecord<T extends Record<string, any>>(
    tableName: string,
    recordId: string,
    updateData: Partial<T>,
    organizationId: string,
    organizationColumn: string = 'organizationId',
    idColumn: string = 'id'
  ): Promise<T | null> {
    // First validate ownership
    const existingRecord = await this.validateRecordOwnership<T>(
      tableName,
      recordId,
      organizationId,
      organizationColumn,
      idColumn
    );

    if (!existingRecord) {
      return null;
    }

    // Update the record
    const updatedData = {
      ...updateData,
      updatedAt: new Date(),
    };

    await db(tableName)
      .where(idColumn, recordId)
      .where(organizationColumn, organizationId)
      .update(updatedData as any);

    // Fetch the updated record
    const updatedRecord = await db(tableName)
      .where(idColumn, recordId)
      .where(organizationColumn, organizationId)
      .first() as T;

    if (!updatedRecord) {
      throw new Error(`Failed to update record in ${tableName}`);
    }

    logger.info({
      tableName,
      recordId,
      organizationId,
    }, 'Organization-scoped record updated');

    return updatedRecord;
  }

  /**
   * Delete a record with organization ownership validation
   */
  async deleteOrganizationScopedRecord(
    tableName: string,
    recordId: string,
    organizationId: string,
    organizationColumn: string = 'organizationId',
    idColumn: string = 'id'
  ): Promise<boolean> {
    // First validate ownership
    const existingRecord = await this.validateRecordOwnership(
      tableName,
      recordId,
      organizationId,
      organizationColumn,
      idColumn
    );

    if (!existingRecord) {
      return false;
    }

    // Delete the record
    const deletedCount = await db(tableName)
      .where(idColumn, recordId)
      .where(organizationColumn, organizationId)
      .del();

    const success = deletedCount > 0;

    if (success) {
      logger.info({
        tableName,
        recordId,
        organizationId,
      }, 'Organization-scoped record deleted');
    }

    return success;
  }

  /**
   * Get all records for an organization with optional filtering
   */
  async getOrganizationRecords<T extends Record<string, any>>(
    tableName: string,
    organizationId: string,
    filters?: Record<string, any>,
    pagination?: PaginationParams,
    organizationColumn: string = 'organizationId'
  ): Promise<PaginatedResponse<T>> {
    let query = this.createOrganizationScopedQuery(
      tableName,
      organizationId,
      organizationColumn
    );

    // Apply additional filters if provided
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.where(key, value);
        }
      });
    }

    return this.executePaginatedQuery<T>(query, pagination);
  }

  /**
   * Search records within an organization
   */
  async searchOrganizationRecords<T extends Record<string, any>>(
    tableName: string,
    organizationId: string,
    searchColumns: string[],
    searchTerm: string,
    pagination?: PaginationParams,
    organizationColumn: string = 'organizationId'
  ): Promise<PaginatedResponse<T>> {
    const searchPattern = `%${searchTerm}%`;
    
    let query = this.createOrganizationScopedQuery(
      tableName,
      organizationId,
      organizationColumn
    );

    // Add search conditions
    query = query.where(function() {
      searchColumns.forEach((column, index) => {
        if (index === 0) {
          this.where(column, 'like', searchPattern);
        } else {
          this.orWhere(column, 'like', searchPattern);
        }
      });
    });

    return this.executePaginatedQuery<T>(query, pagination);
  }

  /**
   * Count records for an organization
   */
  async countOrganizationRecords(
    tableName: string,
    organizationId: string,
    filters?: Record<string, any>,
    organizationColumn: string = 'organizationId'
  ): Promise<number> {
    let query = db(tableName)
      .count('* as count')
      .where(organizationColumn, organizationId);

    // Apply additional filters if provided
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.where(key, value);
        }
      });
    }

    const result = await query.first() as { count: number } | undefined;
    return result?.count || 0;
  }

  /**
   * Execute a transaction with organization context
   */
  async executeOrganizationTransaction<T>(
    organizationId: string,
    transactionCallback: (trx: Knex.Transaction, organizationId: string) => Promise<T>
  ): Promise<T> {
    return db.transaction(async (trx) => {
      logger.debug({ organizationId }, 'Starting organization transaction');
      
      try {
        const result = await transactionCallback(trx, organizationId);
        
        logger.debug({ organizationId }, 'Organization transaction completed successfully');
        return result;
      } catch (error) {
        logger.error({ error, organizationId }, 'Organization transaction failed');
        throw error;
      }
    });
  }

  /**
   * Validate that multiple records belong to the same organization
   */
  async validateMultipleRecordOwnership<T extends Record<string, any>>(
    tableName: string,
    recordIds: string[],
    organizationId: string,
    organizationColumn: string = 'organizationId',
    idColumn: string = 'id'
  ): Promise<T[]> {
    if (recordIds.length === 0) {
      return [];
    }

    const records = await db<T>(tableName)
      .whereIn(idColumn, recordIds)
      .where(organizationColumn, organizationId);

    // Check if all requested records were found
    if (records.length !== recordIds.length) {
      const foundIds = records.map(r => (r as any)[idColumn]);
      const missingIds = recordIds.filter(id => !foundIds.includes(id));
      
      logger.warn({
        tableName,
        organizationId,
        requestedIds: recordIds,
        foundIds,
        missingIds,
      }, 'Some records not found or access denied');
      
      throw new Error(`Some records not found or access denied: ${missingIds.join(', ')}`);
    }

    return records as T[];
  }

  /**
   * Get organization context from tenant context
   */
  getOrganizationContext(tenantContext: TenantContext): string {
    return tenantContext.organizationId;
  }

  /**
   * Create a query builder with automatic tenant context application
   */
  createTenantQuery(
    tableName: string,
    tenantContext: TenantContext,
    organizationColumn: string = 'organizationId'
  ): Knex.QueryBuilder {
    return this.createOrganizationScopedQuery(
      tableName,
      tenantContext.organizationId,
      organizationColumn
    );
  }
}

// Export singleton instance
export const dataAccessService = new DataAccessService();