import { Request, Response, NextFunction } from 'express';
import { sanitizeInput, preventSqlInjection, preventXss } from '../sanitization.middleware';

// Mock request and response objects
const mockRequest = (body: any = {}, query: any = {}, params: any = {}) => {
  const req = {
    body,
    query,
    params,
    id: 'test-request-id',
    path: '/test',
    method: 'POST',
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('test-user-agent'),
  } as any;
  return req as Request;
};

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn() as NextFunction;

describe('Sanitization Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitizeInput', () => {
    it('should sanitize HTML entities in request body', () => {
      const req = mockRequest({ 
        name: '<script>alert("xss")</script>',
        description: 'Test & Company' 
      });
      const res = mockResponse();

      sanitizeInput(req, res, mockNext);

      expect(req.body.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(req.body.description).toBe('Test &amp; Company');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should remove null bytes and control characters', () => {
      const req = mockRequest({ 
        text: 'Hello\x00World\x01Test' 
      });
      const res = mockResponse();

      sanitizeInput(req, res, mockNext);

      expect(req.body.text).toBe('HelloWorldTest');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize nested objects', () => {
      const req = mockRequest({ 
        user: {
          name: '<script>alert("xss")</script>',
          tags: ['<img src="x" onerror="alert(1)">', 'normal tag']
        }
      });
      const res = mockResponse();

      sanitizeInput(req, res, mockNext);

      expect(req.body.user.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(req.body.user.tags[0]).toBe('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;');
      expect(req.body.user.tags[1]).toBe('normal tag');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle non-object inputs gracefully', () => {
      const req = mockRequest('string body');
      const res = mockResponse();

      sanitizeInput(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('preventSqlInjection', () => {
    it('should allow safe input', () => {
      const req = mockRequest({ 
        name: 'John Doe',
        email: 'john@example.com' 
      });
      const res = mockResponse();

      preventSqlInjection(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block SQL injection attempts in body', () => {
      const req = mockRequest({ 
        name: "'; DROP TABLE users; --" 
      });
      const res = mockResponse();

      preventSqlInjection(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_INPUT',
            message: 'Invalid input detected',
          }),
        })
      );
    });

    it('should block SQL injection attempts in query parameters', () => {
      const req = mockRequest({}, { 
        search: "1' OR '1'='1" 
      });
      const res = mockResponse();

      preventSqlInjection(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should block SQL injection attempts with UNION', () => {
      const req = mockRequest({ 
        query: "1 UNION SELECT * FROM users" 
      });
      const res = mockResponse();

      preventSqlInjection(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('preventXss', () => {
    it('should allow safe input', () => {
      const req = mockRequest({ 
        content: 'This is safe content with <b>bold</b> text' 
      });
      const res = mockResponse();

      preventXss(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block script tags', () => {
      const req = mockRequest({ 
        content: '<script>alert("xss")</script>' 
      });
      const res = mockResponse();

      preventXss(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_INPUT',
            message: 'Invalid input detected',
          }),
        })
      );
    });

    it('should block iframe tags', () => {
      const req = mockRequest({ 
        content: '<iframe src="javascript:alert(1)"></iframe>' 
      });
      const res = mockResponse();

      preventXss(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should block javascript: URLs', () => {
      const req = mockRequest({ 
        link: 'javascript:alert("xss")' 
      });
      const res = mockResponse();

      preventXss(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should block event handlers', () => {
      const req = mockRequest({ 
        content: '<img src="x" onerror="alert(1)">' 
      });
      const res = mockResponse();

      preventXss(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});