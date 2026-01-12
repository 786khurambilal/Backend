import { Knex } from 'knex';
import { db } from './connection';
import { logger } from '../config/logger';
import { TenantContext, PaginationParams } from '../types';

/**
 * Tenant-aware query builder that automatically applies organization scoping
 * This ensures all queries are properly isolated by organization
 */
export class TenantQueryBuilder<T extends Record<string, any> = any> {
  private query: Knex.QueryBuilder;
  private organizationId: string;
  private tableName: string;
  private organizationColumn: string;

  constructor(
    tableName: string,
    organizationId: string,
    organizationColumn: string = 'organizationId'
  ) {
    this.tableName = tableName;
    this.organizationId = organizationId;
    this.organizationColumn = organizationColumn;
    
    // Create base query with organization scoping
    this.query = db(tableName).where(organizationColumn, organizationId);
    
    logger.debug({
      tableName,
      organizationId,
      organizationColumn,
    }, 'Created tenant query builder');
  }

  /**
   * Get the underlying Knex query builder
   */
  getQuery(): Knex.QueryBuilder {
    return this.query;
  }

  /**
   * Add a where clause
   */
  where(column: string, operator: any, value?: any): this {
    if (arguments.length === 2) {
      this.query = this.query.where(column, operator);
    } else {
      this.query = this.query.where(column, operator, value);
    }
    return this;
  }

  /**
   * Add a where clause with function
   */
  whereRaw(raw: string, bindings?: any[]): this {
    this.query = this.query.whereRaw(raw, bindings);
    return this;
  }

  /**
   * Add an OR where clause
   */
  orWhere(column: string, operator: any, value?: any): this {
    if (arguments.length === 2) {
      this.query = this.query.orWhere(column, operator);
    } else {
      this.query = this.query.orWhere(column, operator, value);
    }
    return this;
  }

  /**
   * Add a where in clause
   */
  whereIn(column: string, values: any[]): this {
    this.query = this.query.whereIn(column, values);
    return this;
  }

  /**
   * Add a where not in clause
   */
  whereNotIn(column: string, values: any[]): this {
    this.query = this.query.whereNotIn(column, values);
    return this;
  }

  /**
   * Add a where null clause
   */
  whereNull(column: string): this {
    this.query = this.query.whereNull(column);
    return this;
  }

  /**
   * Add a where not null clause
   */
  whereNotNull(column: string): this {
    this.query = this.query.whereNotNull(column);
    return this;
  }

  /**
   * Add a like search clause
   */
  whereLike(column: string, pattern: string): this {
    this.query = this.query.where(column, 'like', `%${pattern}%`);
    return this;
  }

  /**
   * Add multiple like search clauses (OR condition)
   */
  whereMultiLike(columns: string[], pattern: string): this {
    const searchPattern = `%${pattern}%`;
    this.query = this.query.where(function() {
      columns.forEach((column, index) => {
        if (index === 0) {
          this.where(column, 'like', searchPattern);
        } else {
          this.orWhere(column, 'like', searchPattern);
        }
      });
    });
    return this;
  }

  /**
   * Add a join clause
   */
  join(table: string, first: string, second: string): this {
    this.query = this.query.join(table, first, second);
    return this;
  }

  /**
   * Add a left join clause
   */
  leftJoin(table: string, first: string, second: string): this {
    this.query = this.query.leftJoin(table, first, second);
    return this;
  }

  /**
   * Add an inner join clause
   */
  innerJoin(table: string, first: string, second: string): this {
    this.query = this.query.innerJoin(table, first, second);
    return this;
  }

  /**
   * Join with another tenant-scoped table
   */
  joinTenantTable(
    joinTable: string,
    localColumn: string,
    foreignColumn: string,
    joinType: 'join' | 'leftJoin' | 'innerJoin' = 'join',
    joinOrgColumn: string = 'organizationId'
  ): this {
    // Add the join
    this.query = this.query[joinType](joinTable, localColumn, foreignColumn);
    
    // Ensure the joined table is also scoped to the same organization
    this.query = this.query.where(`${joinTable}.${joinOrgColumn}`, this.organizationId);
    
    return this;
  }

  /**
   * Select specific columns
   */
  select(...columns: string[]): this {
    this.query = this.query.select(...columns);
    return this;
  }

  /**
   * Add order by clause
   */
  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.query = this.query.orderBy(column, direction);
    return this;
  }

  /**
   * Add group by clause
   */
  groupBy(...columns: string[]): this {
    this.query = this.query.groupBy(...columns);
    return this;
  }

  /**
   * Add having clause
   */
  having(column: string, operator: any, value?: any): this {
    if (arguments.length === 2) {
      this.query = this.query.having(column, '=', operator);
    } else {
      this.query = this.query.having(column, operator, value);
    }
    return this;
  }

  /**
   * Add limit clause
   */
  limit(count: number): this {
    this.query = this.query.limit(count);
    return this;
  }

  /**
   * Add offset clause
   */
  offset(count: number): this {
    this.query = this.query.offset(count);
    return this;
  }

  /**
   * Apply pagination
   */
  paginate(pagination: PaginationParams): this {
    const { page = 1, limit = 20, sortBy, sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    this.query = this.query.limit(limit).offset(offset);
    
    if (sortBy) {
      this.query = this.query.orderBy(sortBy, sortOrder);
    }

    return this;
  }

  /**
   * Execute the query and return first result
   */
  async first(): Promise<T | undefined> {
    const result = await this.query.first();
    
    logger.debug({
      tableName: this.tableName,
      organizationId: this.organizationId,
      hasResult: !!result,
    }, 'Executed tenant query (first)');

    return result;
  }

  /**
   * Execute the query and return all results
   */
  async execute(): Promise<T[]> {
    const results = await this.query;
    
    logger.debug({
      tableName: this.tableName,
      organizationId: this.organizationId,
      resultCount: results.length,
    }, 'Executed tenant query (all)');

    return results as T[];
  }

  /**
   * Count records
   */
  async count(): Promise<number> {
    const result = await this.query.clone().clearSelect().clearOrder().count('* as count').first() as { count: number } | undefined;
    const count = result?.count || 0;
    
    logger.debug({
      tableName: this.tableName,
      organizationId: this.organizationId,
      count,
    }, 'Executed tenant query (count)');

    return count;
  }

  /**
   * Check if any records exist
   */
  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  /**
   * Insert a record with automatic organization scoping
   */
  async insert(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const insertData = {
      ...data,
      [this.organizationColumn]: this.organizationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db(this.tableName).insert(insertData);
    
    logger.info({
      tableName: this.tableName,
      organizationId: this.organizationId,
    }, 'Inserted tenant-scoped record');
  }

  /**
   * Update records with organization scoping validation
   */
  async update(data: Partial<T>): Promise<number> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    const updatedCount = await this.query.update(updateData as any);
    
    logger.info({
      tableName: this.tableName,
      organizationId: this.organizationId,
      updatedCount,
    }, 'Updated tenant-scoped records');

    return updatedCount as number;
  }

  /**
   * Delete records with organization scoping validation
   */
  async delete(): Promise<number> {
    const deletedCount = await this.query.del();
    
    logger.info({
      tableName: this.tableName,
      organizationId: this.organizationId,
      deletedCount,
    }, 'Deleted tenant-scoped records');

    return deletedCount;
  }

  /**
   * Clone the query builder
   */
  clone(): TenantQueryBuilder<T> {
    const cloned = new TenantQueryBuilder<T>(
      this.tableName,
      this.organizationId,
      this.organizationColumn
    );
    cloned.query = this.query.clone();
    return cloned;
  }

  /**
   * Get the SQL string representation of the query
   */
  toSQL(): string {
    return this.query.toSQL().sql;
  }

  /**
   * Validate that the query is properly scoped to the organization
   */
  validateOrganizationScoping(): boolean {
    const sql = this.toSQL();
    const hasOrgFilter = sql.includes(`${this.organizationColumn} = ?`) || 
                        sql.includes(`\`${this.organizationColumn}\` = ?`);
    
    if (!hasOrgFilter) {
      logger.warn({
        tableName: this.tableName,
        organizationId: this.organizationId,
        sql,
      }, 'Query may not be properly scoped to organization');
    }

    return hasOrgFilter;
  }
}

/**
 * Factory function to create a tenant query builder
 */
export function createTenantQuery<T extends Record<string, any> = any>(
  tableName: string,
  organizationId: string,
  organizationColumn: string = 'organizationId'
): TenantQueryBuilder<T> {
  return new TenantQueryBuilder<T>(tableName, organizationId, organizationColumn);
}

/**
 * Factory function to create a tenant query builder from tenant context
 */
export function createTenantQueryFromContext<T extends Record<string, any> = any>(
  tableName: string,
  tenantContext: TenantContext,
  organizationColumn: string = 'organizationId'
): TenantQueryBuilder<T> {
  return new TenantQueryBuilder<T>(tableName, tenantContext.organizationId, organizationColumn);
}

/**
 * Utility function to validate that a query is organization-scoped
 */
export function validateQueryOrganizationScoping(
  query: Knex.QueryBuilder,
  organizationId: string,
  organizationColumn: string = 'organizationId'
): boolean {
  const sql = query.toSQL().sql;
  const hasOrgFilter = sql.includes(`${organizationColumn} = ?`) || 
                      sql.includes(`\`${organizationColumn}\` = ?`);
  
  if (!hasOrgFilter) {
    logger.warn({
      organizationId,
      organizationColumn,
      sql,
    }, 'Query may not be properly scoped to organization');
  }

  return hasOrgFilter;
}