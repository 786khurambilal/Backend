import { serviceRegistry } from './service-registry';
import { database } from './database';
import { logger } from './logger';
import { emailService } from '../services/email.service';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { organizationService } from '../services/organization.service';
import { teamService } from '../services/team.service';
import { auditService } from '../services/audit.service';
import { debugRouteService } from '../services/debug-route.service';
import { errorLogService } from '../services/error-log.service';
import { tokenCleanupService } from '../services/token-cleanup.service';
import { healthService } from '../services/health.service';

/**
 * Dependency Injection Container
 * Manages service dependencies and provides centralized service access
 */
export class DIContainer {
  private static instance: DIContainer;
  private services: Map<string, any> = new Map();

  private constructor() {
    this.registerServices();
  }

  public static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  /**
   * Register all services with the service registry
   */
  private registerServices(): void {
    // Database service
    serviceRegistry.register({
      name: 'database',
      instance: database,
      dependencies: [],
      initialize: async () => {
        await database.connect();
      },
      shutdown: async () => {
        await database.disconnect();
      },
      healthCheck: async () => {
        return await database.healthCheck();
      },
    });

    // Email service
    serviceRegistry.register({
      name: 'emailService',
      instance: emailService,
      dependencies: [],
      healthCheck: async () => {
        return await emailService.testConnection();
      },
    });

    // Auth service
    serviceRegistry.register({
      name: 'authService',
      instance: authService,
      dependencies: ['database'],
    });

    // User service
    serviceRegistry.register({
      name: 'userService',
      instance: userService,
      dependencies: ['database', 'authService', 'emailService'],
    });

    // Organization service
    serviceRegistry.register({
      name: 'organizationService',
      instance: organizationService,
      dependencies: ['database', 'userService', 'emailService'],
    });

    // Team service
    serviceRegistry.register({
      name: 'teamService',
      instance: teamService,
      dependencies: ['database', 'organizationService'],
    });

    // Audit service
    serviceRegistry.register({
      name: 'auditService',
      instance: auditService,
      dependencies: ['database'],
    });

    // Debug route service
    serviceRegistry.register({
      name: 'debugRouteService',
      instance: debugRouteService,
      dependencies: ['database'],
    });

    // Error log service
    serviceRegistry.register({
      name: 'errorLogService',
      instance: errorLogService,
      dependencies: ['database'],
    });

    // Token cleanup service
    serviceRegistry.register({
      name: 'tokenCleanupService',
      instance: tokenCleanupService,
      dependencies: ['authService'],
      initialize: async () => {
        // Token cleanup service will be started manually in index.ts
      },
      shutdown: async () => {
        tokenCleanupService.stop();
      },
    });

    // Health service
    serviceRegistry.register({
      name: 'healthService',
      instance: healthService,
      dependencies: ['database', 'emailService'],
    });

    // Store services in local map for quick access
    this.services.set('database', database);
    this.services.set('logger', logger);
    this.services.set('emailService', emailService);
    this.services.set('authService', authService);
    this.services.set('userService', userService);
    this.services.set('organizationService', organizationService);
    this.services.set('teamService', teamService);
    this.services.set('auditService', auditService);
    this.services.set('debugRouteService', debugRouteService);
    this.services.set('errorLogService', errorLogService);
    this.services.set('tokenCleanupService', tokenCleanupService);
    this.services.set('healthService', healthService);
  }

  public get<T>(serviceName: string): T {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in DI container`);
    }
    return service;
  }

  public set(serviceName: string, service: any): void {
    this.services.set(serviceName, service);
  }

  public has(serviceName: string): boolean {
    return this.services.has(serviceName);
  }

  /**
   * Initialize all services with their dependencies
   */
  public async initialize(): Promise<void> {
    try {
      await serviceRegistry.initializeAll();
      logger.info('All services initialized successfully via service registry');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize services via service registry');
      throw error;
    }
  }

  /**
   * Cleanup all services
   */
  public async cleanup(): Promise<void> {
    try {
      await serviceRegistry.shutdownAll();
      logger.info('DI container cleanup completed');
    } catch (error) {
      logger.error({ error }, 'Error during DI container cleanup');
      throw error;
    }
  }

  /**
   * Get service health status
   */
  public async getServiceHealth(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};
    
    for (const [serviceName] of this.services) {
      try {
        healthStatus[serviceName] = serviceRegistry.isInitialized(serviceName);
      } catch (error) {
        healthStatus[serviceName] = false;
      }
    }

    return healthStatus;
  }
}

// Export singleton instance
export const diContainer = DIContainer.getInstance();