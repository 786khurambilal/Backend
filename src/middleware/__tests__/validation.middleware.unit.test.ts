import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest, commonSchemas } from '../validation.middleware';

// Mock request and response objects
const mockRequest = (body: any = {}, query: any = {}, params: any = {}) => {
  const req = {
    body,
    query,
    params,
    id: 'test-request-id',
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

describe('Validation Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateRequest', () => {
    it('should pass validation with valid data', () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(1),
      });

      const middleware = validateRequest({ body: schema });
      const req = mockRequest({ email: 'test@example.com', name: 'Test User' });
      const res = mockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid data', () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(1),
      });

      const middleware = validateRequest({ body: schema });
      const req = mockRequest({ email: 'invalid-email', name: '' });
      const res = mockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: expect.any(Array),
          }),
        })
      );
    });

    it('should validate query parameters', () => {
      const schema = z.object({
        page: z.coerce.number().min(1),
      });

      const middleware = validateRequest({ query: schema });
      const req = mockRequest({}, { page: '2' });
      const res = mockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req.query as any).page).toBe(2);
    });

    it('should validate route parameters', () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      const middleware = validateRequest({ params: schema });
      const req = mockRequest({}, {}, { id: '123e4567-e89b-12d3-a456-426614174000' });
      const res = mockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Common Schemas', () => {
    it('should validate email correctly', () => {
      expect(() => commonSchemas.email.parse('test@example.com')).not.toThrow();
      expect(() => commonSchemas.email.parse('invalid-email')).toThrow();
    });

    it('should validate password correctly', () => {
      expect(() => commonSchemas.password.parse('ValidPass123')).not.toThrow();
      expect(() => commonSchemas.password.parse('weak')).toThrow();
      expect(() => commonSchemas.password.parse('nouppercaseornumber')).toThrow();
    });

    it('should validate UUID correctly', () => {
      expect(() => commonSchemas.uuidParam.parse({ id: '123e4567-e89b-12d3-a456-426614174000' })).not.toThrow();
      expect(() => commonSchemas.uuidParam.parse({ id: 'invalid-uuid' })).toThrow();
    });

    it('should validate role correctly', () => {
      expect(() => commonSchemas.role.parse('ADMIN')).not.toThrow();
      expect(() => commonSchemas.role.parse('INVALID_ROLE')).toThrow();
    });
  });
});