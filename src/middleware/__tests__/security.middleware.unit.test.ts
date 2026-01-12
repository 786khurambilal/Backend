import { Request, Response, NextFunction } from 'express';
import { requestId, securityHeaders, requestSizeLimit, validateUserAgent } from '../security.middleware';

// Mock request and response objects
const mockRequest = (headers: Record<string, string> = {}) => {
  const req = {
    get: jest.fn((header: string) => headers[header]),
    path: '/test',
    method: 'POST',
    ip: '127.0.0.1',
  } as any;
  return req as Request;
};

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.removeHeader = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn() as NextFunction;

describe('Security Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestId', () => {
    it('should generate request ID when not provided', () => {
      const req = mockRequest();
      const res = mockResponse();

      requestId(req, res, mockNext);

      expect(req.id).toBeDefined();
      expect(typeof req.id).toBe('string');
      expect(req.id).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.id);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing X-Request-ID header', () => {
      const existingId = 'existing-request-id';
      const req = mockRequest({ 'X-Request-ID': existingId });
      const res = mockResponse();

      requestId(req, res, mockNext);

      expect(req.id).toBe(existingId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', existingId);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('securityHeaders', () => {
    it('should set cache control headers for API routes', () => {
      const req = mockRequest();
      (req as any).path = '/api/test';
      const res = mockResponse();

      securityHeaders(req, res, mockNext);

      expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(res.removeHeader).toHaveBeenCalledWith('Server');
      expect(res.setHeader).toHaveBeenCalledWith('X-API-Version', '1.0.0');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set cache control headers for API routes', () => {
      const req = mockRequest();
      (req as any).path = '/api/users';
      const res = mockResponse();

      securityHeaders(req, res, mockNext);

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requestSizeLimit', () => {
    it('should allow requests within size limit', () => {
      const req = mockRequest({ 'Content-Length': '1000' });
      const res = mockResponse();
      const middleware = requestSizeLimit('10mb');

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding size limit', () => {
      const req = mockRequest({ 'Content-Length': '20971520' }); // 20MB
      (req as any).id = 'test-request-id';
      const res = mockResponse();
      const middleware = requestSizeLimit('10mb');

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload too large',
            maxSize: '10mb',
          }),
        })
      );
    });

    it('should allow requests without Content-Length header', () => {
      const req = mockRequest();
      const res = mockResponse();
      const middleware = requestSizeLimit('10mb');

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('validateUserAgent', () => {
    it('should allow valid user agents', () => {
      const req = mockRequest({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
      const res = mockResponse();

      validateUserAgent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block empty user agents', () => {
      const req = mockRequest({ 'User-Agent': '' });
      (req as any).id = 'test-request-id';
      const res = mockResponse();

      validateUserAgent(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_USER_AGENT',
            message: 'User agent required',
          }),
        })
      );
    });

    it('should allow suspicious user agents in test environment', () => {
      // In test environment, suspicious user agents should be allowed (like development)
      const req = mockRequest({ 'User-Agent': 'curl/7.68.0' });
      const res = mockResponse();

      validateUserAgent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow suspicious user agents in development', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';

      const req = mockRequest({ 'User-Agent': 'curl/7.68.0' });
      const res = mockResponse();

      validateUserAgent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();

      process.env['NODE_ENV'] = originalEnv;
    });
  });
});