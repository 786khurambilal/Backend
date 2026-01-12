import { db } from '../database/connection';
import { DebugRoute } from '../types';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export class DebugRouteService {
  private static instance: DebugRouteService;
  private debugRoutes: Map<string, boolean> = new Map();
  private initialized = false;

  private constructor() {}

  public static getInstance(): DebugRouteService {
    if (!DebugRouteService.instance) {
      DebugRouteService.instance = new DebugRouteService();
    }
    return DebugRouteService.instance;
  }

  /**
   * Initialize debug routes cache from database
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const routes = await db('debug_routes')
        .select('route_pattern', 'enabled')
        .where('enabled', true);

      this.debugRoutes.clear();
      routes.forEach(route => {
        this.debugRoutes.set(route.route_pattern, route.enabled);
      });

      this.initialized = true;
      logger.info({ routeCount: routes.length }, 'Debug routes cache initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize debug routes cache');
      throw error;
    }
  }

  /**
   * Check if debug logging is enabled for a route
   */
  public isDebugEnabled(route: string): boolean {
    if (!this.initialized) {
      logger.warn('Debug routes cache not initialized, defaulting to false');
      return false;
    }

    // Check exact match first
    if (this.debugRoutes.has(route)) {
      return this.debugRoutes.get(route) || false;
    }

    // Check pattern matches
    for (const [pattern, enabled] of this.debugRoutes.entries()) {
      if (enabled && this.matchesPattern(route, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all debug routes
   */
  public async getAllDebugRoutes(): Promise<DebugRoute[]> {
    try {
      const routes = await db('debug_routes')
        .select('*')
        .orderBy('created_at', 'desc');

      return routes.map(route => ({
        id: route.id,
        routePattern: route.route_pattern,
        enabled: route.enabled,
        createdBy: route.created_by,
        createdAt: route.created_at,
        updatedAt: route.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get debug routes');
      throw error;
    }
  }

  /**
   * Create a new debug route configuration
   */
  public async createDebugRoute(
    routePattern: string,
    enabled: boolean,
    createdBy: string
  ): Promise<DebugRoute> {
    try {
      const id = uuidv4();
      const now = new Date();

      await db('debug_routes').insert({
        id,
        route_pattern: routePattern,
        enabled,
        created_by: createdBy,
        created_at: now,
        updated_at: now,
      });

      // Update cache
      if (enabled) {
        this.debugRoutes.set(routePattern, enabled);
      }

      const debugRoute: DebugRoute = {
        id,
        routePattern,
        enabled,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };

      logger.info({ debugRoute }, 'Debug route created');
      return debugRoute;
    } catch (error) {
      logger.error({ error, routePattern }, 'Failed to create debug route');
      throw error;
    }
  }

  /**
   * Update debug route configuration
   */
  public async updateDebugRoute(
    id: string,
    enabled: boolean
  ): Promise<DebugRoute | null> {
    try {
      const now = new Date();

      const updatedCount = await db('debug_routes')
        .where('id', id)
        .update({
          enabled,
          updated_at: now,
        });

      if (updatedCount === 0) {
        return null;
      }

      const route = await db('debug_routes')
        .select('*')
        .where('id', id)
        .first();

      if (route) {
        // Update cache
        if (enabled) {
          this.debugRoutes.set(route.route_pattern, enabled);
        } else {
          this.debugRoutes.delete(route.route_pattern);
        }

        const debugRoute: DebugRoute = {
          id: route.id,
          routePattern: route.route_pattern,
          enabled: route.enabled,
          createdBy: route.created_by,
          createdAt: route.created_at,
          updatedAt: route.updated_at,
        };

        logger.info({ debugRoute }, 'Debug route updated');
        return debugRoute;
      }

      return null;
    } catch (error) {
      logger.error({ error, id }, 'Failed to update debug route');
      throw error;
    }
  }

  /**
   * Delete debug route configuration
   */
  public async deleteDebugRoute(id: string): Promise<boolean> {
    try {
      // Get route pattern before deletion for cache cleanup
      const route = await db('debug_routes')
        .select('route_pattern')
        .where('id', id)
        .first();

      const deletedCount = await db('debug_routes')
        .where('id', id)
        .del();

      if (deletedCount > 0 && route) {
        // Remove from cache
        this.debugRoutes.delete(route.route_pattern);
        logger.info({ id, routePattern: route.route_pattern }, 'Debug route deleted');
        return true;
      }

      return false;
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete debug route');
      throw error;
    }
  }

  /**
   * Refresh cache from database
   */
  public async refreshCache(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Check if route matches pattern (supports wildcards)
   */
  private matchesPattern(route: string, pattern: string): boolean {
    // Convert pattern to regex
    // Replace * with .* and escape other regex special characters
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*'); // Replace * with .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(route);
  }
}

export const debugRouteService = DebugRouteService.getInstance();