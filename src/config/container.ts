/**
 * Simple Dependency Injection Container
 * Provides basic service registration and resolution
 */
export class Container {
  private services: Map<string, any> = new Map();
  private singletons: Map<string, any> = new Map();

  /**
   * Register a service factory
   */
  register<T>(name: string, factory: () => T): void {
    this.services.set(name, factory);
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(name: string, factory: () => T): void {
    this.services.set(name, factory);
    this.singletons.set(name, null); // Mark as singleton
  }

  /**
   * Resolve a service by name
   */
  resolve<T>(name: string): T {
    const factory = this.services.get(name);
    if (!factory) {
      throw new Error(`Service '${name}' not registered`);
    }

    // Check if it's a singleton
    if (this.singletons.has(name)) {
      let instance = this.singletons.get(name);
      if (!instance) {
        instance = factory();
        this.singletons.set(name, instance);
      }
      return instance;
    }

    // Return new instance
    return factory();
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Clear all services
   */
  clear(): void {
    this.services.clear();
    this.singletons.clear();
  }
}

// Export default container instance
export const container = new Container();