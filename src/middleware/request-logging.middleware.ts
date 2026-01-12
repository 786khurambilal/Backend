import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface RequestLogContext {
  requestId: string;
  method: string;
  url: string;
  path: string;
  ip: string;
  userAgent?: string;
  userId?: string;
  organizationId?: string;
  startTime: number;
  statusCode?: number;
  duration?: number;
  responseSize?: number;
  errorMessage?: string;
}

/**
 * Comprehensive request/response logging middleware
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Create request context
  const requestContext: RequestLogContext = {
    requestId: req.id?.toString() || 'unknown',
    method: req.method,
    url: req.url,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    startTime,
  };

  // Add optional properties
  const userAgent = req.get('User-Agent');
  if (userAgent) {
    requestContext.userAgent = userAgent;
  }

  // Log request start
  logger.info({
    requestId: requestContext.requestId,
    method: requestContext.method,
    url: requestContext.url,
    path: requestContext.path,
    route: req.route?.path,
    ip: requestContext.ip,
    userAgent: requestContext.userAgent,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    params: Object.keys(req.params).length > 0 ? req.params : undefined,
    ...(env.NODE_ENV === 'development' && {
      headers: filterSensitiveHeaders(req.headers),
      body: filterSensitiveBody(req.body),
    }),
  }, 'Request started');

  // Capture original response methods
  const originalSend = res.send;
  const originalJson = res.json;
  const originalEnd = res.end;

  let responseBody: any;
  let responseSize = 0;

  // Override res.json to capture response body
  res.json = function(body: any) {
    responseBody = body;
    responseSize = JSON.stringify(body).length;
    return originalJson.call(this, body);
  };

  // Override res.send to capture response body
  res.send = function(body: any) {
    if (!responseBody) {
      responseBody = body;
      responseSize = typeof body === 'string' ? body.length : JSON.stringify(body).length;
    }
    return originalSend.call(this, body);
  };

  // Override res.end to capture when response finishes
  res.end = function(chunk?: any, encoding?: any) {
    if (chunk && !responseBody) {
      responseBody = chunk;
      responseSize = typeof chunk === 'string' ? chunk.length : Buffer.byteLength(chunk);
    }
    return originalEnd.call(this, chunk, encoding);
  };

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Update request context with response info
    requestContext.statusCode = statusCode;
    requestContext.duration = duration;
    requestContext.responseSize = responseSize;
    if (req.userId) {
      requestContext.userId = req.userId;
    }
    if (req.organizationId) {
      requestContext.organizationId = req.organizationId;
    }

    // Determine log level based on status code
    let logLevel: 'info' | 'warn' | 'error' = 'info';
    let message = 'Request completed successfully';

    if (statusCode >= 500) {
      logLevel = 'error';
      message = 'Request completed with server error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
      message = 'Request completed with client error';
    }

    // Create log entry
    const logEntry = {
      requestId: requestContext.requestId,
      method: requestContext.method,
      url: requestContext.url,
      path: requestContext.path,
      route: req.route?.path,
      ip: requestContext.ip,
      userAgent: requestContext.userAgent,
      userId: requestContext.userId,
      organizationId: requestContext.organizationId,
      statusCode,
      duration,
      responseSize,
      ...(env.NODE_ENV === 'development' && statusCode >= 400 && {
        responseBody: filterSensitiveResponse(responseBody),
      }),
    };

    // Log based on level
    logger[logLevel](logEntry, message);

    // Log slow requests as warnings
    if (duration > 5000 && statusCode < 400) {
      logger.warn({
        ...logEntry,
        slowRequest: true,
      }, 'Slow request detected');
    }
  });

  // Log response errors
  res.on('error', (error: Error) => {
    const duration = Date.now() - startTime;
    
    logger.error({
      requestId: requestContext.requestId,
      method: requestContext.method,
      url: requestContext.url,
      path: requestContext.path,
      ip: requestContext.ip,
      duration,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    }, 'Response error occurred');
  });

  next();
}

/**
 * Filter sensitive headers from logging
 */
function filterSensitiveHeaders(headers: any): any {
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
  ];

  const filtered = { ...headers };
  
  for (const header of sensitiveHeaders) {
    if (filtered[header]) {
      filtered[header] = '[REDACTED]';
    }
  }

  return filtered;
}

/**
 * Filter sensitive body fields from logging
 */
function filterSensitiveBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'apiKey',
    'creditCard',
    'ssn',
  ];

  const filtered = { ...body };
  
  for (const field of sensitiveFields) {
    if (filtered[field]) {
      filtered[field] = '[REDACTED]';
    }
  }

  return filtered;
}

/**
 * Filter sensitive response fields from logging
 */
function filterSensitiveResponse(response: any): any {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const sensitiveFields = [
    'accessToken',
    'refreshToken',
    'token',
    'passwordHash',
    'secret',
  ];

  const filtered = JSON.parse(JSON.stringify(response));
  
  function filterRecursive(obj: any): void {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (sensitiveFields.includes(key)) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          filterRecursive(obj[key]);
        }
      }
    }
  }

  filterRecursive(filtered);
  return filtered;
}

/**
 * Performance monitoring middleware
 */
export function performanceMonitoringMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();
  
  // Capture original response methods to add timing header before sending
  const originalSend = res.send;
  const originalJson = res.json;
  const originalEnd = res.end;

  // Override response methods to add timing header before sending
  function addTimingHeader() {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Add performance headers in development (before response is sent)
    if (env.NODE_ENV === 'development' && !res.headersSent) {
      res.setHeader('X-Response-Time', `${Math.round(duration)}ms`);
    }
  }

  res.json = function(body: any) {
    addTimingHeader();
    return originalJson.call(this, body);
  };

  res.send = function(body: any) {
    addTimingHeader();
    return originalSend.call(this, body);
  };

  res.end = function(chunk?: any, encoding?: any) {
    addTimingHeader();
    return originalEnd.call(this, chunk, encoding);
  };
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Log performance metrics
    if (duration > 1000) { // Log requests taking more than 1 second
      logger.warn({
        requestId: req.id,
        method: req.method,
        path: req.path,
        duration: Math.round(duration),
        statusCode: res.statusCode,
        performanceIssue: true,
      }, 'Performance issue detected');
    }
  });

  next();
}

/**
 * Request size monitoring middleware
 */
export function requestSizeMonitoringMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const contentLength = req.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (size > maxSize) {
      logger.warn({
        requestId: req.id,
        method: req.method,
        path: req.path,
        contentLength: size,
        maxAllowed: maxSize,
      }, 'Large request detected');
    }
  }

  next();
}