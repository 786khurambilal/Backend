import { authService } from './auth.service';
import { logger } from '../config/logger';

export class TokenCleanupService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly cleanupIntervalMs: number;

  constructor(cleanupIntervalMs: number = 24 * 60 * 60 * 1000) { // Default: 24 hours
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  /**
   * Start the token cleanup service
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Token cleanup service is already running');
      return;
    }

    logger.info({ intervalMs: this.cleanupIntervalMs }, 'Starting token cleanup service');

    // Run cleanup immediately
    this.runCleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop the token cleanup service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Token cleanup service stopped');
    }
  }

  /**
   * Run token cleanup manually
   */
  async runCleanup(): Promise<void> {
    try {
      await authService.cleanupExpiredTokens();
    } catch (error) {
      logger.error({ error }, 'Token cleanup failed');
    }
  }
}

// Export singleton instance
export const tokenCleanupService = new TokenCleanupService();