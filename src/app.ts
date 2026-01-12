import express, { Application, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { database } from './config/database';
import { swaggerSpec } from './config/swagger';
import { diContainer } from './config/dependency-injection';
import { healthService } from './services/health.service';
import { authRoutes } from './routes/auth.routes';
import { userRoutes } from './routes/user.routes';
import { organizationRoutes } from './routes/organization.routes';
import { teamRoutes } from './routes/team.routes';
import auditRoutes from './routes/audit.routes';
import { adminRoutes } from './routes/admin.routes';

/**
 * @swagger
 * tags:
 *   name: System
 *   description: System health and information endpoints
 */

// Import security middleware
import { 
  helmetConfig, 
  corsConfig, 
  requestId, 
  securityHeaders, 
  requestSizeLimit 
} from './middleware/security.middleware';
import { sanitizeInput, preventSqlInjection, preventXss } from './middleware/sanitization.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { 
  correlationIdMiddleware, 
  debugLoggingMiddleware, 
  initializeDebugRoutes 
} from './middleware/debug-logging.middleware';
import { 
  requestLoggingMiddleware, 
  performanceMonitoringMiddleware,
  requestSizeMonitoringMiddleware 
} from './middleware/request-logging.middleware';

export class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Request ID and correlation ID middleware (must be first)
    this.app.use(requestId);
    this.app.use(correlationIdMiddleware);

    // Initialize debug routes cache
    this.app.use(initializeDebugRoutes);

    // Security middleware
    this.app.use(helmetConfig);
    this.app.use(securityHeaders);
    
    // CORS configuration
    this.app.use(corsConfig);

    // Request size monitoring and limiting
    this.app.use(requestSizeMonitoringMiddleware);
    this.app.use(requestSizeLimit(env.MAX_REQUEST_SIZE));

    // Body parsing middleware
    this.app.use(express.json({ limit: env.MAX_REQUEST_SIZE }));
    this.app.use(express.urlencoded({ extended: true, limit: env.MAX_REQUEST_SIZE }));

    // Input sanitization and security
    this.app.use(sanitizeInput);
    this.app.use(preventSqlInjection);
    this.app.use(preventXss);

    // Comprehensive request/response logging
    this.app.use(requestLoggingMiddleware);
    this.app.use(performanceMonitoringMiddleware);

    // Debug logging with configurable routes
    this.app.use(debugLoggingMiddleware);
  }

  private initializeRoutes(): void {
    /**
     * @swagger
     * /health:
     *   get:
     *     summary: Health check endpoint
     *     description: Returns the health status of the API and all dependencies
     *     tags: [System]
     *     security: []
     *     responses:
     *       200:
     *         description: System is healthy
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status:
     *                   type: string
     *                   enum: [healthy, degraded, unhealthy]
     *                   example: 'healthy'
     *                 timestamp:
     *                   type: string
     *                   format: date-time
     *                   example: '2024-01-01T00:00:00.000Z'
     *                 uptime:
     *                   type: number
     *                   description: 'Server uptime in seconds'
     *                   example: 3600
     *                 environment:
     *                   type: string
     *                   example: 'development'
     *                 checks:
     *                   type: object
     *                   properties:
     *                     database:
     *                       type: object
     *                       properties:
     *                         status:
     *                           type: string
     *                           enum: [healthy, degraded, unhealthy]
     *                         message:
     *                           type: string
     *                         latency:
     *                           type: number
     *                     email:
     *                       type: object
     *                       properties:
     *                         status:
     *                           type: string
     *                           enum: [healthy, degraded, unhealthy]
     *                         message:
     *                           type: string
     *                     memory:
     *                       type: object
     *                       properties:
     *                         status:
     *                           type: string
     *                           enum: [healthy, degraded, unhealthy]
     *                         message:
     *                           type: string
     *                         details:
     *                           type: object
     *       503:
     *         description: System is unhealthy
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/HealthCheckResult'
     */
    // Comprehensive health check endpoint
    this.app.get('/health', async (_req: Request, res: Response) => {
      try {
        const healthResult = await healthService.performHealthCheck();
        const statusCode = healthResult.status === 'unhealthy' ? 503 : 200;
        res.status(statusCode).json(healthResult);
      } catch (error) {
        logger.error({ error }, 'Health check failed');
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: env.NODE_ENV,
          error: 'Health check failed',
        });
      }
    });

    /**
     * @swagger
     * /health/live:
     *   get:
     *     summary: Liveness probe endpoint
     *     description: Simple liveness check for Kubernetes/Docker health checks
     *     tags: [System]
     *     security: []
     *     responses:
     *       200:
     *         description: Service is alive
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status:
     *                   type: string
     *                   example: 'alive'
     *                 timestamp:
     *                   type: string
     *                   format: date-time
     *       503:
     *         description: Service is not alive
     */
    // Liveness probe for Kubernetes
    this.app.get('/health/live', async (_req: Request, res: Response) => {
      try {
        const isAlive = await healthService.isAlive();
        if (isAlive) {
          res.json({
            status: 'alive',
            timestamp: new Date().toISOString(),
          });
        } else {
          res.status(503).json({
            status: 'not alive',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'not alive',
          timestamp: new Date().toISOString(),
          error: 'Liveness check failed',
        });
      }
    });

    /**
     * @swagger
     * /health/ready:
     *   get:
     *     summary: Readiness probe endpoint
     *     description: Readiness check for Kubernetes/Docker health checks
     *     tags: [System]
     *     security: []
     *     responses:
     *       200:
     *         description: Service is ready
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status:
     *                   type: string
     *                   example: 'ready'
     *                 timestamp:
     *                   type: string
     *                   format: date-time
     *       503:
     *         description: Service is not ready
     */
    // Readiness probe for Kubernetes
    this.app.get('/health/ready', async (_req: Request, res: Response) => {
      try {
        const isReady = await healthService.isReady();
        if (isReady) {
          res.json({
            status: 'ready',
            timestamp: new Date().toISOString(),
          });
        } else {
          res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          error: 'Readiness check failed',
        });
      }
    });

    /**
     * @swagger
     * /:
     *   get:
     *     summary: API root endpoint
     *     description: Returns basic API information and documentation link
     *     tags: [System]
     *     security: []
     *     responses:
     *       200:
     *         description: API information
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: 'Multi-Tenant SaaS Backend API'
     *                 version:
     *                   type: string
     *                   example: '1.0.0'
     *                 environment:
     *                   type: string
     *                   example: 'development'
     *                 documentation:
     *                   type: string
     *                   example: '/docs'
     */

    // API Documentation
    this.app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Multi-Tenant SaaS Backend API Documentation',
    }));

    // Swagger JSON endpoint
    this.app.get('/docs.json', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    // Authentication routes
    this.app.use('/auth', authRoutes);

    // User management routes
    this.app.use('/users', userRoutes);

    // Organization management routes
    this.app.use('/organizations', organizationRoutes);

    // Team management routes (nested under organizations)
    this.app.use('/organizations', teamRoutes);

    // Audit routes
    this.app.use('/', auditRoutes);

    // Admin routes (debug and error management)
    this.app.use('/admin', adminRoutes);

    // API routes will be added here
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        message: 'Multi-Tenant SaaS Backend API',
        version: '1.0.0',
        environment: env.NODE_ENV,
        documentation: '/docs',
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use('*', notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize dependency injection container
      await diContainer.initialize();
      logger.info('Dependency injection container initialized');

      // Initialize database connection
      await database.connect();
      logger.info('Database connected successfully');

      // Perform initial health check
      const healthResult = await healthService.performHealthCheck();
      logger.info({ healthResult }, 'Initial health check completed');

    } catch (error) {
      logger.error({ error }, 'Failed to initialize application');
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      // Cleanup dependency injection container
      await diContainer.cleanup();
      logger.info('Application shutdown completed');
    } catch (error) {
      logger.error({ error }, 'Error during application shutdown');
      throw error;
    }
  }
}