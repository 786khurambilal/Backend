import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { errorLogService } from '../services/error-log.service';

/**
 * Error types and interfaces
 */
export abstract class AppError extends Error {
  abstract statusCode: number;
  abstract code: string;
  abstract isOperational: boolean;
  details?: any;

  constructor(message: string, details?: any) {
    super(message);
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
    timestamp: string;
    stack?: string;
  };
}

/**
 * Custom error classes
 */
export class ValidationError extends AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;

  constructor(message: string, details?: any) {
    super(message, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';
  isOperational = true;

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  statusCode = 403;
  code = 'AUTHORIZATION_ERROR';
  isOperational = true;

  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  statusCode = 404;
  code = 'NOT_FOUND';
  isOperational = true;

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  statusCode = 409;
  code = 'CONFLICT';
  isOperational = true;

  constructor(message: string = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';
  isOperational = true;

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class InternalServerError extends AppError {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';
  isOperational = true;

  constructor(message: string = 'Internal server error') {
    super(message);
    this.name = 'InternalServerError';
  }
}

export class DatabaseError extends AppError {
  statusCode = 500;
  code = 'DATABASE_ERROR';
  isOperational = true;

  constructor(message: string = 'Database operation failed') {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ExternalServiceError extends AppError {
  statusCode = 502;
  code = 'EXTERNAL_SERVICE_ERROR';
  isOperational = true;

  constructor(message: string = 'External service error') {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

/**
 * Error handler utility functions
 */
function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational === true;
  }
  return false;
}

function getErrorStatusCode(error: Error): number {
  if (error instanceof AppError && error.statusCode) {
    return error.statusCode;
  }

  if (error instanceof ZodError) {
    return 400;
  }

  // Database errors
  if (error.message.includes('ECONNREFUSED') || 
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT')) {
    return 503;
  }

  return 500;
}

function getErrorCode(error: Error): string {
  if (error instanceof AppError && error.code) {
    return error.code;
  }

  if (error instanceof ZodError) {
    return 'VALIDATION_ERROR';
  }

  // Database connection errors
  if (error.message.includes('ECONNREFUSED')) {
    return 'DATABASE_CONNECTION_ERROR';
  }

  if (error.message.includes('ENOTFOUND')) {
    return 'SERVICE_UNAVAILABLE';
  }

  if (error.message.includes('ETIMEDOUT')) {
    return 'REQUEST_TIMEOUT';
  }

  return 'INTERNAL_SERVER_ERROR';
}

function sanitizeErrorMessage(error: Error): string {
  // In production, don't expose internal error details
  if (env.NODE_ENV === 'production' && !isOperationalError(error)) {
    return 'Internal server error';
  }

  return error.message;
}

function formatZodError(error: ZodError): any {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
}

/**
 * Log error with appropriate level and context
 */
async function logError(error: Error, req: Request): Promise<void> {
  const errorContext = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: getErrorStatusCode(error),
      code: getErrorCode(error),
    },
    request: {
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.userId,
      organizationId: req.organizationId,
    },
    timestamp: new Date().toISOString(),
  };

  const statusCode = getErrorStatusCode(error);

  if (statusCode >= 500) {
    logger.error(errorContext, 'Server error occurred');
  } else if (statusCode >= 400) {
    logger.warn(errorContext, 'Client error occurred');
  } else {
    logger.info(errorContext, 'Request completed with error');
  }

  // Log to database for tracking and analysis
  try {
    await errorLogService.createErrorLog({
      organizationId: req.organizationId,
      requestId: String(req.id) || 'unknown',
      route: req.route?.path || req.path,
      method: req.method,
      statusCode,
      errorMessage: error.message,
      errorStack: error.stack,
      metaJson: {
        errorName: error.name,
        errorCode: getErrorCode(error),
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: req.userId,
        query: req.query,
        params: req.params,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (dbError) {
    logger.error({ error: dbError, requestId: req.id }, 'Failed to log error to database');
  }
}

/**
 * Main error handling middleware
 */
export async function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  // Log the error
  await logError(error, req);

  const statusCode = getErrorStatusCode(error);
  const errorCode = getErrorCode(error);
  const message = sanitizeErrorMessage(error);

  // Build error response
  const errorResponse: ErrorResponse = {
    error: {
      code: errorCode,
      message,
      requestId: req.id?.toString() || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  // Add error details for specific error types
  if (error instanceof ZodError) {
    errorResponse.error.details = formatZodError(error);
  } else if (error instanceof AppError && error.details) {
    errorResponse.error.details = error.details;
  }

  // Add stack trace in development
  if (env.NODE_ENV === 'development' && error.stack) {
    errorResponse.error.stack = error.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  
  logger.warn({
    request: {
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    },
  }, 'Route not found');

  res.status(404).json({
    error: {
      code: error.code,
      message: error.message,
      path: req.path,
      method: req.method,
      requestId: req.id?.toString() || 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Process exit handler for uncaught errors
 */
export function handleUncaughtErrors(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    
    // Give the logger time to write
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.fatal({ 
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    }, 'Unhandled promise rejection');
    
    // Give the logger time to write
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
}

/**
 * Graceful shutdown handler
 */
export function handleGracefulShutdown(server: any): void {
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    
    server.close((err: Error) => {
      if (err) {
        logger.error({ error: err.message }, 'Error during server shutdown');
        process.exit(1);
      }
      
      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}