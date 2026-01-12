import { db } from '../database/connection';
import { ErrorLog, PaginatedResponse, PaginationParams } from '../types';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ErrorLogFilters {
  organizationId?: string | undefined;
  route?: string | undefined;
  method?: string | undefined;
  statusCode?: number | undefined;
  minStatusCode?: number | undefined;
  maxStatusCode?: number | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  requestId?: string | undefined;
}

export interface CreateErrorLogData {
  organizationId?: string | undefined;
  requestId: string;
  route: string;
  method: string;
  statusCode: number;
  errorMessage: string;
  errorStack?: string | undefined;
  metaJson?: object | undefined;
}

export class ErrorLogService {
  /**
   * Create a new error log entry
   */
  public async createErrorLog(data: CreateErrorLogData): Promise<ErrorLog> {
    try {
      const id = uuidv4();
      const now = new Date();

      await db('error_logs').insert({
        id,
        organization_id: data.organizationId || null,
        request_id: data.requestId,
        route: data.route,
        method: data.method,
        status_code: data.statusCode,
        error_message: data.errorMessage,
        error_stack: data.errorStack || null,
        meta_json: data.metaJson ? JSON.stringify(data.metaJson) : null,
        created_at: now,
      });

      const errorLog: ErrorLog = {
        id,
        organizationId: data.organizationId || undefined,
        requestId: data.requestId,
        route: data.route,
        method: data.method,
        statusCode: data.statusCode,
        errorMessage: data.errorMessage,
        errorStack: data.errorStack,
        metaJson: data.metaJson,
        createdAt: now,
      };

      logger.debug({ errorLog }, 'Error log created');
      return errorLog;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create error log');
      throw error;
    }
  }

  /**
   * Get error logs with filtering and pagination
   */
  public async getErrorLogs(
    filters: ErrorLogFilters = {},
    pagination: PaginationParams = { page: 1, limit: 50 }
  ): Promise<PaginatedResponse<ErrorLog>> {
    try {
      let query = db('error_logs').select('*');

      // Apply filters
      if (filters.organizationId) {
        query = query.where('organization_id', filters.organizationId);
      }

      if (filters.route) {
        query = query.where('route', 'like', `%${filters.route}%`);
      }

      if (filters.method) {
        query = query.where('method', filters.method);
      }

      if (filters.statusCode) {
        query = query.where('status_code', filters.statusCode);
      }

      if (filters.minStatusCode) {
        query = query.where('status_code', '>=', filters.minStatusCode);
      }

      if (filters.maxStatusCode) {
        query = query.where('status_code', '<=', filters.maxStatusCode);
      }

      if (filters.startDate) {
        query = query.where('created_at', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('created_at', '<=', filters.endDate);
      }

      if (filters.requestId) {
        query = query.where('request_id', filters.requestId);
      }

      // Get total count
      const countQuery = query.clone().count('* as count');
      const countResult = await countQuery;
      const total = parseInt(String(countResult[0]?.['count'] || 0), 10);

      // Apply pagination and sorting
      const offset = (pagination.page - 1) * pagination.limit;
      const sortBy = pagination.sortBy || 'created_at';
      const sortOrder = pagination.sortOrder || 'desc';

      query = query
        .orderBy(sortBy, sortOrder)
        .limit(pagination.limit)
        .offset(offset);

      const rows = await query;

      const errorLogs: ErrorLog[] = rows.map(row => ({
        id: row.id,
        organizationId: row.organization_id,
        requestId: row.request_id,
        route: row.route,
        method: row.method,
        statusCode: row.status_code,
        errorMessage: row.error_message,
        errorStack: row.error_stack,
        metaJson: row.meta_json ? JSON.parse(row.meta_json) : undefined,
        createdAt: row.created_at,
      }));

      const totalPages = Math.ceil(total / pagination.limit);

      return {
        data: errorLogs,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages,
          hasNext: pagination.page < totalPages,
          hasPrev: pagination.page > 1,
        },
      };
    } catch (error) {
      logger.error({ error, filters, pagination }, 'Failed to get error logs');
      throw error;
    }
  }

  /**
   * Get error log by ID
   */
  public async getErrorLogById(id: string): Promise<ErrorLog | null> {
    try {
      const row = await db('error_logs')
        .select('*')
        .where('id', id)
        .first();

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        organizationId: row.organization_id,
        requestId: row.request_id,
        route: row.route,
        method: row.method,
        statusCode: row.status_code,
        errorMessage: row.error_message,
        errorStack: row.error_stack,
        metaJson: row.meta_json ? JSON.parse(row.meta_json) : undefined,
        createdAt: row.created_at,
      };
    } catch (error) {
      logger.error({ error, id }, 'Failed to get error log by ID');
      throw error;
    }
  }

  /**
   * Get error logs by request ID (for correlation)
   */
  public async getErrorLogsByRequestId(requestId: string): Promise<ErrorLog[]> {
    try {
      const rows = await db('error_logs')
        .select('*')
        .where('request_id', requestId)
        .orderBy('created_at', 'desc');

      return rows.map(row => ({
        id: row.id,
        organizationId: row.organization_id,
        requestId: row.request_id,
        route: row.route,
        method: row.method,
        statusCode: row.status_code,
        errorMessage: row.error_message,
        errorStack: row.error_stack,
        metaJson: row.meta_json ? JSON.parse(row.meta_json) : undefined,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to get error logs by request ID');
      throw error;
    }
  }

  /**
   * Delete old error logs (cleanup)
   */
  public async deleteOldErrorLogs(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const deletedCount = await db('error_logs')
        .where('created_at', '<', cutoffDate)
        .del();

      logger.info({ deletedCount, cutoffDate }, 'Old error logs deleted');
      return deletedCount;
    } catch (error) {
      logger.error({ error, olderThanDays }, 'Failed to delete old error logs');
      throw error;
    }
  }

  /**
   * Get error statistics
   */
  public async getErrorStatistics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalErrors: number;
    errorsByStatusCode: { statusCode: number; count: number }[];
    errorsByRoute: { route: string; count: number }[];
    errorsByMethod: { method: string; count: number }[];
  }> {
    try {
      let baseQuery = db('error_logs');

      if (organizationId) {
        baseQuery = baseQuery.where('organization_id', organizationId);
      }

      if (startDate) {
        baseQuery = baseQuery.where('created_at', '>=', startDate);
      }

      if (endDate) {
        baseQuery = baseQuery.where('created_at', '<=', endDate);
      }

      // Total errors
      const totalResult = await baseQuery.clone().count('* as count');
      const totalErrors = parseInt(String(totalResult[0]?.['count'] || 0), 10);

      // Errors by status code
      const errorsByStatusCode = await baseQuery
        .clone()
        .select('status_code as statusCode')
        .count('* as count')
        .groupBy('status_code')
        .orderBy('count', 'desc');

      // Errors by route
      const errorsByRoute = await baseQuery
        .clone()
        .select('route')
        .count('* as count')
        .groupBy('route')
        .orderBy('count', 'desc')
        .limit(10);

      // Errors by method
      const errorsByMethod = await baseQuery
        .clone()
        .select('method')
        .count('* as count')
        .groupBy('method')
        .orderBy('count', 'desc');

      return {
        totalErrors,
        errorsByStatusCode: errorsByStatusCode.map(row => ({
          statusCode: Number(row['statusCode']),
          count: parseInt(String(row['count']), 10),
        })),
        errorsByRoute: errorsByRoute.map(row => ({
          route: String(row['route']),
          count: parseInt(String(row['count']), 10),
        })),
        errorsByMethod: errorsByMethod.map(row => ({
          method: String(row['method']),
          count: parseInt(String(row['count']), 10),
        })),
      };
    } catch (error) {
      logger.error({ error, organizationId, startDate, endDate }, 'Failed to get error statistics');
      throw error;
    }
  }
}

export const errorLogService = new ErrorLogService();