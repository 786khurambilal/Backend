import { UserService } from '../user.service';
import { authService } from '../auth.service';
import { emailService } from '../email.service';
import { db } from '../../database/connection';
import { User } from '../../types';

// Mock dependencies
jest.mock('../auth.service');
jest.mock('../email.service');
jest.mock('../../database/connection');

const mockAuthService = authService as jest.Mocked<typeof authService>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;
const mockDb = db as jest.Mocked<typeof db>;

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    const mockUserData = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    const mockUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      firstName: 'John',
      lastName: 'Doe',
      isEmailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      // Mock database queries
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null), // No existing user
        insert: jest.fn().mockResolvedValue([1]),
      });

      mockAuthService.hashPassword.mockResolvedValue('hashed-password');
      mockEmailService.sendEmailVerificationEmail.mockResolvedValue();
    });

    it('should register a new user successfully', async () => {
      // Mock the user creation and retrieval
      (mockDb as any)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null), // No existing user
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue([1]),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockUser),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockUser), // User exists for token creation
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue([1]), // Email verification token
        });

      const result = await service.registerUser(mockUserData);

      expect(result).toEqual(mockUser);
      expect(mockAuthService.hashPassword).toHaveBeenCalledWith('Password123!');
      expect(mockEmailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
    });

    it('should throw error if user already exists', async () => {
      // Mock existing user
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUser),
      });

      await expect(service.registerUser(mockUserData)).rejects.toThrow('User already exists');
    });
  });

  describe('requestPasswordReset', () => {
    const mockUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      firstName: 'John',
      lastName: 'Doe',
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should send password reset email for existing user', async () => {
      // Mock user exists
      (mockDb as any)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockUser),
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue([1]), // Password reset token
        });

      mockEmailService.sendPasswordResetEmail.mockResolvedValue();

      await service.requestPasswordReset('test@example.com');

      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
    });

    it('should not reveal if user does not exist', async () => {
      // Mock user does not exist
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      // Should not throw error
      await expect(service.requestPasswordReset('nonexistent@example.com')).resolves.toBeUndefined();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const mockToken = 'verification-token-123';
    const mockUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      firstName: 'John',
      lastName: 'Doe',
      isEmailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should verify email successfully with valid token', async () => {
      const mockVerificationToken = {
        id: 'token-123',
        userId: 'user-123',
        token: mockToken,
        expiresAt: new Date(Date.now() + 60000), // Future date
        isUsed: false,
        createdAt: new Date(),
      };

      // Mock token lookup
      (mockDb as any)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockVerificationToken),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockUser),
        });

      // Mock transaction
      const mockTrx = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue([1]),
      });
      (mockDb as any).transaction = jest.fn().mockImplementation((callback) => 
        callback(mockTrx)
      );

      await service.verifyEmail({ token: mockToken });

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should throw error for invalid token', async () => {
      // Mock invalid token
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      await expect(service.verifyEmail({ token: 'invalid-token' }))
        .rejects.toThrow('Invalid or expired verification token');
    });
  });

  describe('updateUserProfile', () => {
    const mockUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      firstName: 'John',
      lastName: 'Doe',
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update user profile successfully', async () => {
      const updateData = {
        firstName: 'Jane',
        lastName: 'Smith',
      };

      const updatedUser = {
        ...mockUser,
        ...updateData,
        updatedAt: new Date(),
      };

      // Mock user exists and update
      (mockDb as any)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockUser),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue([1]),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(updatedUser),
        });

      const result = await service.updateUserProfile('user-123', updateData);

      expect(result).toEqual(updatedUser);
    });

    it('should throw error if user not found', async () => {
      // Mock user not found
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      await expect(service.updateUserProfile('nonexistent', { firstName: 'Jane' }))
        .rejects.toThrow('User not found');
    });
  });
});