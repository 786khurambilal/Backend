import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';
import { debugRouteService } from '../services/debug-route.service';
import { errorLogService } from '../services/error-log.service';

/**
 * Middleware to add correlation ID to requests
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate or use existing correlation ID
  const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  
  // Add to request
  req.id = correlationId;
  
  // Add to response headers
  res.setHeader('x-correlation-id', correlationId);
  
  next();
}

/**
 * Enhanced request logging middleware with debug capabilities
 */
export function debugLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const route = req.route?.path || req.path;
  const isDebugEnabled = debugRouteService.isDebugEnabled(route);

  // Base request info
  const baseRequestInfo = {
    requestId: req.id,
    method: req.method,
    url: req.url,
    path: req.path,
    route,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.userId,
    organizationId: req.organizationId,
  };

  // Enhanced debug info (only if debug is enabled for this route)
  const debugRequestInfo = isDebugEnabled ? {
    ...baseRequestInfo,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      'user-agent': req.get('User-Agent'),
      'x-forwarded-for': req.get('X-Forwarded-For'),
      'x-real-ip': req.get('X-Real-IP'),
    },
    query: req.query,
    params: req.params,
    body: sanitizeRequestBody(req.body),
  } : baseRequestInfo;

  // Log request start
  if (isDebugEnabled) {
    logger.debug(debugRequestInfo, 'Request started (debug mode)');
  } else {
    logger.info(baseRequestInfo, 'Request started');
  }

  // Capture original res.json to log response
  const originalJson = res.json;
  let responseBody: any;

  res.json = function(body: any) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Handle response completion
  const logResponse = () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    const baseResponseInfo = {
      ...baseRequestInfo,
      statusCode,
      duration,
    };

    const debugResponseInfo = isDebugEnabled ? {
      ...baseResponseInfo,
      responseHeaders: {
        'content-type': res.get('Content-Type'),
        'content-length': res.get('Content-Length'),
        'x-correlation-id': res.get('x-correlation-id'),
      },
      responseBody: sanitizeResponseBody(responseBody, statusCode),
    } : baseResponseInfo;

    // Log based on status code and debug mode
    if (statusCode >= 500) {
      logger.error(debugResponseInfo, 'Request completed with server error');
    } else if (statusCode >= 400) {
      logger.warn(debugResponseInfo, 'Request completed with client error');
    } else if (isDebugEnabled) {
      logger.debug(debugResponseInfo, 'Request completed successfully (debug mode)');
    } else {
      logger.info(baseResponseInfo, 'Request completed successfully');
    }

    // Log error to database if it's an error response
    if (statusCode >= 400) {
      logErrorToDatabase(req, responseBody, statusCode);
    }
  };

  // Listen for response finish
  res.on('finish', logResponse);
  res.on('close', logResponse);

  next();
}

/**
 * Log errors to database for tracking and analysis
 */
async function logErrorToDatabase(
  req: Request,
  responseBody: any,
  statusCode: number
): Promise<void> {
  try {
    const errorMessage = extractErrorMessage(responseBody);
    const errorStack = extractErrorStack(responseBody);
    
    await errorLogService.createErrorLog({
      organizationId: req.organizationId,
      requestId: String(req.id) || 'unknown',
      route: req.route?.path || req.path,
      method: req.method,
      statusCode,
      errorMessage,
      errorStack,
      metaJson: {
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: req.userId,
        query: req.query,
        params: req.params,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error, requestId: req.id }, 'Failed to log error to database');
  }
}

/**
 * Extract error message from response body
 */
function extractErrorMessage(responseBody: any): string {
  if (!responseBody) return 'Unknown error';
  
  if (typeof responseBody === 'string') return responseBody;
  
  if (responseBody.error?.message) return responseBody.error.message;
  if (responseBody.message) return responseBody.message;
  if (responseBody.error) return JSON.stringify(responseBody.error);
  
  return JSON.stringify(responseBody);
}

/**
 * Extract error stack from response body
 */
function extractErrorStack(responseBody: any): string | undefined {
  if (!responseBody) return undefined;
  
  if (responseBody.error?.stack) return responseBody.error.stack;
  if (responseBody.stack) return responseBody.stack;
  
  return undefined;
}

/**
 * Sanitize request body for logging (remove sensitive data)
 */
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'key',
    'authorization',
  ];

  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Sanitize response body for logging (remove sensitive data)
 */
function sanitizeResponseBody(body: any, statusCode: number): any {
  if (!body || typeof body !== 'object') return body;

  // Don't log successful response bodies in production to avoid data leaks
  if (statusCode < 400 && process.env['NODE_ENV'] === 'production') {
    return '[RESPONSE_BODY_OMITTED]';
  }

  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'key',
  ];

  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Middleware to initialize debug route service
 */
export async function initializeDebugRoutes(
  _req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await debugRouteService.initialize();
    next();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize debug routes');
    next(error);
  }
}