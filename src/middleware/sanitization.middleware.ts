import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * HTML entity encoding map
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escape HTML entities in a string
 */
function escapeHtml(str: string): string {
  return str.replace(/[&<>"'/]/g, (match) => HTML_ENTITIES[match] || match);
}

/**
 * Remove or escape potentially dangerous characters
 */
function sanitizeString(value: string): string {
  if (typeof value !== 'string') {
    return value;
  }

  // Remove null bytes
  let sanitized = value.replace(/\0/g, '');

  // Remove control characters except tab, newline, and carriage return
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Escape HTML entities
  sanitized = escapeHtml(sanitized);

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize the key as well
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Input sanitization middleware
 * Sanitizes request body, query parameters, and route parameters
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize route parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown sanitization error',
      path: req.path,
      method: req.method,
      ip: req.ip,
    }, 'Input sanitization failed');

    res.status(500).json({
      error: {
        code: 'SANITIZATION_ERROR',
        message: 'Failed to process request data',
        requestId: req.id?.toString() || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * SQL injection prevention middleware
 * Additional layer of protection against SQL injection attempts
 */
export function preventSqlInjection(req: Request, res: Response, next: NextFunction): void {
  const sqlInjectionPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /('|(\\')|(;)|(--)|(\s+OR\s+))/gi,
    /(\/\*|\*\/)/gi,
  ];

  const checkForSqlInjection = (value: string): boolean => {
    return sqlInjectionPatterns.some(pattern => pattern.test(value));
  };

  const scanObject = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return checkForSqlInjection(obj);
    }

    if (Array.isArray(obj)) {
      return obj.some(scanObject);
    }

    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(scanObject);
    }

    return false;
  };

  try {
    // Check request body
    if (req.body && scanObject(req.body)) {
      logger.warn({
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body,
      }, 'Potential SQL injection attempt detected in request body');

      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid input detected',
          requestId: req.id?.toString() || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check query parameters
    if (req.query && scanObject(req.query)) {
      logger.warn({
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        query: req.query,
      }, 'Potential SQL injection attempt detected in query parameters');

      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid input detected',
          requestId: req.id?.toString() || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check route parameters
    if (req.params && scanObject(req.params)) {
      logger.warn({
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        params: req.params,
      }, 'Potential SQL injection attempt detected in route parameters');

      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid input detected',
          requestId: req.id?.toString() || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
    }, 'SQL injection prevention middleware error');

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * XSS prevention middleware
 * Additional protection against cross-site scripting attempts
 */
export function preventXss(req: Request, res: Response, next: NextFunction): void {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    // eslint-disable-next-line no-useless-escape
    /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi,
  ];

  const checkForXss = (value: string): boolean => {
    return xssPatterns.some(pattern => pattern.test(value));
  };

  const scanObject = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return checkForXss(obj);
    }

    if (Array.isArray(obj)) {
      return obj.some(scanObject);
    }

    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(scanObject);
    }

    return false;
  };

  try {
    // Check request body
    if (req.body && scanObject(req.body)) {
      logger.warn({
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      }, 'Potential XSS attempt detected');

      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid input detected',
          requestId: req.id?.toString() || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
    }, 'XSS prevention middleware error');

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        requestId: req.id?.toString() || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  }
}