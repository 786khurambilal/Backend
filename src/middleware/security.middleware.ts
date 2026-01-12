import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Enhanced Helmet configuration for security headers
 */
export const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      connectSrc: ["'self'"],
      workerSrc: ["'none'"],
      upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
    },
  },

  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false, // Disable for API compatibility

  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy: { policy: 'same-origin' },

  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: { policy: 'cross-origin' },

  // DNS Prefetch Control
  dnsPrefetchControl: { allow: false },

  // Frameguard (X-Frame-Options)
  frameguard: { action: 'deny' },

  // Hide Powered-By header
  hidePoweredBy: true,

  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // IE No Open
  ieNoOpen: true,

  // No Sniff (X-Content-Type-Options)
  noSniff: true,

  // Origin Agent Cluster
  originAgentCluster: true,

  // Permitted Cross-Domain Policies
  permittedCrossDomainPolicies: false,

  // Referrer Policy
  referrerPolicy: { policy: 'no-referrer' },

  // X-XSS-Protection
  xssFilter: true,
});

/**
 * CORS configuration
 */
export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [];
    
    // In development, allow all origins
    if (env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // In production, check against allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn({ origin, allowedOrigins }, 'CORS origin not allowed');
    return callback(new Error('Not allowed by CORS'), false);
  },
  
  credentials: true,
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
    'X-Organization-ID',
  ],
  
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  
  maxAge: 86400, // 24 hours
});

/**
 * Request ID middleware
 * Adds a unique request ID to each request for tracing
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.get('X-Request-ID') || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

/**
 * Security headers middleware
 * Adds additional custom security headers
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // Add custom security headers
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Add cache control for API responses
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  next();
}

/**
 * Request size limit middleware
 * Prevents large payload attacks
 */
export function requestSizeLimit(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength, 10);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        logger.warn({
          contentLength: sizeInBytes,
          maxSize: maxSizeInBytes,
          path: req.path,
          method: req.method,
          ip: req.ip,
        }, 'Request size limit exceeded');

        res.status(413).json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload too large',
            maxSize,
            requestId: req.id?.toString() || 'unknown',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
    }

    next();
  };
}

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match || !match[1]) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';

  if (!units[unit]) {
    throw new Error(`Unknown unit: ${unit}`);
  }

  return Math.floor(value * units[unit]);
}

/**
 * IP whitelist middleware
 * Restricts access to specific IP addresses (for admin endpoints)
 */
export function ipWhitelist(allowedIps: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.connection.remoteAddress || '';
    
    // In development, allow all IPs
    if (env.NODE_ENV === 'development') {
      return next();
    }

    // Check if IP is in whitelist
    const isAllowed = allowedIps.some(allowedIp => {
      if (allowedIp.includes('/')) {
        // CIDR notation support would require additional library
        return false;
      }
      return clientIp === allowedIp;
    });

    if (!isAllowed) {
      logger.warn({
        clientIp,
        allowedIps,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
      }, 'IP not in whitelist');

      res.status(403).json({
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'Access denied',
          requestId: req.id?.toString() || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
}

/**
 * User agent validation middleware
 * Blocks requests from suspicious user agents
 */
export function validateUserAgent(req: Request, res: Response, next: NextFunction): void {
  const userAgent = req.get('User-Agent') || '';
  
  // Block empty user agents
  if (!userAgent.trim()) {
    logger.warn({
      path: req.path,
      method: req.method,
      ip: req.ip,
    }, 'Request with empty user agent blocked');

    res.status(400).json({
      error: {
        code: 'INVALID_USER_AGENT',
        message: 'User agent required',
        requestId: req.id?.toString() || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Block suspicious user agents
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http-client/i,
  ];

  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspicious && env.NODE_ENV === 'production') {
    logger.warn({
      userAgent,
      path: req.path,
      method: req.method,
      ip: req.ip,
    }, 'Suspicious user agent blocked');

    res.status(403).json({
      error: {
        code: 'SUSPICIOUS_USER_AGENT',
        message: 'Access denied',
        requestId: req.id?.toString() || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  next();
}