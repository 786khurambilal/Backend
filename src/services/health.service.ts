import { database } from '../config/database';
import { logger } from '../config/logger';
import { emailService } from './email.service';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  checks: {
    database: HealthCheck;
    email: HealthCheck;
    memory: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  latency?: number;
  details?: any;
}

export class HealthService {
  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    const checks = {
      database: await this.checkDatabase(),
      email: await this.checkEmail(),
      memory: await this.checkMemory(),
    };

    // Determine overall status
    const hasUnhealthy = Object.values(checks).some(check => check.status === 'unhealthy');
    const hasDegraded = Object.values(checks).some(check => check.status === 'degraded');
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (hasUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (hasDegraded) {
      overallStatus = 'degraded';
    }

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env['NODE_ENV'] || 'development',
      checks,
    };

    const totalTime = Date.now() - startTime;
    logger.info({ 
      healthCheck: result, 
      duration: totalTime 
    }, 'Health check completed');

    return result;
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<HealthCheck> {
    try {
      const startTime = Date.now();
      
      // Test basic connectivity
      await database.connection.raw('SELECT 1 as test');
      
      // Test a more complex query to ensure tables exist
      await database.connection('users').count('* as count').first();
      
      const latency = Date.now() - startTime;
      
      return {
        status: latency > 1000 ? 'degraded' : 'healthy',
        message: latency > 1000 ? 'Database responding slowly' : 'Database connection healthy',
        latency,
      };
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Database connection failed',
      };
    }
  }

  /**
   * Check email service connectivity
   */
  private async checkEmail(): Promise<HealthCheck> {
    try {
      const startTime = Date.now();
      
      // Test SMTP connection without sending email
      const isHealthy = await emailService.testConnection();
      
      const latency = Date.now() - startTime;
      
      if (isHealthy) {
        return {
          status: 'healthy',
          message: 'Email service connection healthy',
          latency,
        };
      } else {
        return {
          status: 'degraded',
          message: 'Email service connection issues',
          latency,
        };
      }
    } catch (error) {
      logger.error({ error }, 'Email service health check failed');
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Email service unavailable',
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    try {
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal;
      const usedMemory = memUsage.heapUsed;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Memory usage normal';

      if (memoryUsagePercent > 90) {
        status = 'unhealthy';
        message = 'Critical memory usage';
      } else if (memoryUsagePercent > 75) {
        status = 'degraded';
        message = 'High memory usage';
      }

      return {
        status,
        message,
        details: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024), // MB
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          usagePercent: Math.round(memoryUsagePercent),
        },
      };
    } catch (error) {
      logger.error({ error }, 'Memory health check failed');
      return {
        status: 'unhealthy',
        message: 'Failed to check memory usage',
      };
    }
  }

  /**
   * Simple health check for basic liveness probe
   */
  async isAlive(): Promise<boolean> {
    try {
      await database.connection.raw('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Readiness check for readiness probe
   */
  async isReady(): Promise<boolean> {
    try {
      // Check if all critical services are ready
      const dbCheck = await this.checkDatabase();
      return dbCheck.status !== 'unhealthy';
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const healthService = new HealthService();