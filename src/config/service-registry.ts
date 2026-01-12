import { logger } from './logger';

/**
 * Service Registry for managing service lifecycle and dependencies
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services: Map<string, ServiceDefinition> = new Map();
  private initialized: Set<string> = new Set();
  private starting: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register a service with its dependencies
   */
  register(definition: ServiceDefinition): void {
    this.services.set(definition.name, definition);
    logger.debug({ serviceName: definition.name }, 'Service registered');
  }

  /**
   * Initialize all services in dependency order
   */
  async initializeAll(): Promise<void> {
    const initOrder = this.resolveDependencyOrder();
    
    for (const serviceName of initOrder) {
      await this.initializeService(serviceName);
    }

    logger.info({ 
      servicesInitialized: Array.from(this.initialized) 
    }, 'All services initialized');
  }

  /**
   * Initialize a specific service and its dependencies
   */
  async initializeService(serviceName: string): Promise<void> {
    if (this.initialized.has(serviceName)) {
      return; // Already initialized
    }

    if (this.starting.has(serviceName)) {
      throw new Error(`Circular dependency detected for service: ${serviceName}`);
    }

    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    this.starting.add(serviceName);

    try {
      // Initialize dependencies first
      for (const dependency of service.dependencies || []) {
        await this.initializeService(dependency);
      }

      // Initialize the service
      if (service.initialize) {
        await service.initialize();
      }

      this.initialized.add(serviceName);
      this.starting.delete(serviceName);

      logger.info({ serviceName }, 'Service initialized');
    } catch (error) {
      this.starting.delete(serviceName);
      logger.error({ serviceName, error }, 'Failed to initialize service');
      throw error;
    }
  }

  /**
   * Shutdown all services in reverse dependency order
   */
  async shutdownAll(): Promise<void> {
    const shutdownOrder = this.resolveDependencyOrder().reverse();
    
    for (const serviceName of shutdownOrder) {
      await this.shutdownService(serviceName);
    }

    logger.info('All services shut down');
  }

  /**
   * Shutdown a specific service
   */
  async shutdownService(serviceName: string): Promise<void> {
    if (!this.initialized.has(serviceName)) {
      return; // Not initialized
    }

    const service = this.services.get(serviceName);
    if (!service) {
      return;
    }

    try {
      if (service.shutdown) {
        await service.shutdown();
      }

      this.initialized.delete(serviceName);
      logger.info({ serviceName }, 'Service shut down');
    } catch (error) {
      logger.error({ serviceName, error }, 'Failed to shutdown service');
      throw error;
    }
  }

  /**
   * Get service instance
   */
  getService<T>(serviceName: string): T {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    if (!this.initialized.has(serviceName)) {
      throw new Error(`Service not initialized: ${serviceName}`);
    }

    return service.instance as T;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(serviceName: string): boolean {
    return this.initialized.has(serviceName);
  }

  /**
   * Resolve dependency order using topological sort
   */
  private resolveDependencyOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string): void => {
      if (visited.has(serviceName)) {
        return;
      }

      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected: ${serviceName}`);
      }

      visiting.add(serviceName);

      const service = this.services.get(serviceName);
      if (service) {
        for (const dependency of service.dependencies || []) {
          visit(dependency);
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    for (const serviceName of this.services.keys()) {
      visit(serviceName);
    }

    return order;
  }
}

/**
 * Service definition interface
 */
export interface ServiceDefinition {
  name: string;
  instance?: any;
  dependencies?: string[];
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
  healthCheck?: () => Promise<boolean>;
}

// Export singleton instance
export const serviceRegistry = ServiceRegistry.getInstance();