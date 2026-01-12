import { logger } from './logger';
import { env } from './env';

/**
 * Production-ready error handling configuration
 * Handles uncaught exceptions and unhandled rejections gracefully
 */
export class ProductionErrorHandler {
  private static instance: ProductionErrorHandler;
  private shutdownInProgress = false;

  private constructor() {}

  public static getInstance(): ProductionErrorHandler {
    if (!ProductionErrorHandler.instance) {
      ProductionErrorHandler.instance = new ProductionErrorHandler();
    }
    return ProductionErrorHandler.instance;
  }

  /**
   * Initialize production error handling
   */
  public initialize(): void {
    this.setupUncaughtExceptionHandler();
    this.setupUnhandledRejectionHandler();
    this.setupProcessWarningHandler();
    this.setupSignalHandlers();
  }

  /**
   * Handle uncaught exceptions
   */
  private setupUncaughtExceptionHandler(): void {
    process.on('uncaughtException', (error: Error) => {
      logger.fatal({
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        pid: process.pid,
        uptime: process.uptime(),
      }, 'Uncaught exception - shutting down');

      this.gracefulShutdown('uncaughtException', 1);
    });
  }

  /**
   * Handle unhandled promise rejections
   */
  private setupUnhandledRejectionHandler(): void {
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      logger.fatal({
        reason: reason instanceof Error ? {
          name: reason.name,
          message: reason.message,
          stack: reason.stack,
        } : reason,
        promise: promise.toString(),
        pid: process.pid,
        uptime: process.uptime(),
      }, 'Unhandled promise rejection - shutting down');

      this.gracefulShutdown('unhandledRejection', 1);
    });
  }

  /**
   * Handle process warnings
   */
  private setupProcessWarningHandler(): void {
    process.on('warning', (warning: Error) => {
      logger.warn({
        warning: {
          name: warning.name,
          message: warning.message,
          stack: warning.stack,
        },
      }, 'Process warning detected');
    });
  }

  /**
   * Handle shutdown signals
   */
  private setupSignalHandlers(): void {
    // Graceful shutdown signals
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    
    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info({ signal }, 'Received shutdown signal');
        this.gracefulShutdown(signal, 0);
      });
    });

    // Handle SIGUSR2 for nodemon restarts
    process.on('SIGUSR2', () => {
      logger.info('Received SIGUSR2 - restarting');
      this.gracefulShutdown('SIGUSR2', 0);
    });
  }

  /**
   * Perform graceful shutdown
   */
  private gracefulShutdown(reason: string, exitCode: number): void {
    if (this.shutdownInProgress) {
      logger.warn('Shutdown already in progress, forcing exit');
      process.exit(exitCode);
    }

    this.shutdownInProgress = true;

    logger.info({ reason, exitCode }, 'Starting graceful shutdown');

    // Set a timeout for forced shutdown
    const forceShutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 10000); // 10 seconds

    // Perform cleanup
    this.performCleanup()
      .then(() => {
        clearTimeout(forceShutdownTimeout);
        logger.info('Graceful shutdown completed');
        process.exit(exitCode);
      })
      .catch((error) => {
        clearTimeout(forceShutdownTimeout);
        logger.error({ error }, 'Error during graceful shutdown');
        process.exit(1);
      });
  }

  /**
   * Perform application cleanup
   */
  private async performCleanup(): Promise<void> {
    const cleanupTasks: Promise<void>[] = [];

    // Add cleanup tasks here
    // Note: Actual cleanup will be handled by the App class
    // This is just a placeholder for additional cleanup if needed

    try {
      await Promise.all(cleanupTasks);
      logger.info('All cleanup tasks completed');
    } catch (error) {
      logger.error({ error }, 'Some cleanup tasks failed');
      throw error;
    }
  }

  /**
   * Log system information for debugging
   */
  public logSystemInfo(): void {
    const systemInfo = {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptime: process.uptime(),
      },
      memory: process.memoryUsage(),
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    };

    logger.info({ systemInfo }, 'System information');
  }

  /**
   * Setup memory monitoring
   */
  public setupMemoryMonitoring(): void {
    if (env.NODE_ENV === 'production') {
      setInterval(() => {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);

        // Log memory usage if it's high
        if (heapUsedMB > 500) { // More than 500MB
          logger.warn({
            memory: {
              heapUsed: heapUsedMB,
              heapTotal: heapTotalMB,
              rss: rssMB,
              external: Math.round(memUsage.external / 1024 / 1024),
            },
          }, 'High memory usage detected');
        }
      }, 60000); // Check every minute
    }
  }
}

// Export singleton instance
export const productionErrorHandler = ProductionErrorHandler.getInstance();