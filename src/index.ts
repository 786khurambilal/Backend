import { App } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { tokenCleanupService } from './services/token-cleanup.service';
import { productionErrorHandler } from './config/production-error-handling';

async function startServer(): Promise<void> {
  try {
    // Initialize production error handling
    productionErrorHandler.initialize();
    productionErrorHandler.logSystemInfo();
    productionErrorHandler.setupMemoryMonitoring();

    const app = new App();
    
    // Initialize the application
    await app.initialize();

    // Start token cleanup service
    tokenCleanupService.start();

    // Start the server
    const server = app.app.listen(env.PORT, env.HOST, () => {
      logger.info({
        port: env.PORT,
        host: env.HOST,
        environment: env.NODE_ENV,
        pid: process.pid,
        nodeVersion: process.version,
      }, 'Server started successfully');
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Received shutdown signal');
      
      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Cleanup application resources
          await app.shutdown();
          tokenCleanupService.stop();
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error({ error }, 'Error during graceful shutdown');
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 15000); // 15 seconds timeout
    };

    // Handle shutdown signals (handled by productionErrorHandler now)
    // These are backup handlers in case the production error handler fails
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.fatal({ error }, 'Server startup failed');
  process.exit(1);
});