import { EmailService } from '../email.service';
import nodemailer from 'nodemailer';

// Mock nodemailer
jest.mock('nodemailer');
const mockNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

// Mock environment
jest.mock('../../config/env', () => ({
  env: {
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'test@example.com',
    SMTP_PASSWORD: 'password',
    FROM_EMAIL: 'noreply@example.com',
    FROM_NAME: 'Test App',
    FRONTEND_URL: 'http://localhost:3000',
  },
}));

describe('EmailService', () => {
  let emailService: EmailService;
  let mockTransporter: any;

  beforeEach(() => {
    mockTransporter = {
      sendMail: jest.fn(),
      verify: jest.fn(),
    };
    mockNodemailer.createTransport.mockReturnValue(mockTransporter);
    emailService = new EmailService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    it('should send email with correct parameters', async () => {
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      const emailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
        text: 'Test text content',
      };

      await emailService.sendEmail(emailOptions);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'Test App <noreply@example.com>',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
        text: 'Test text content',
      });
    });

    it('should generate text from HTML if text is not provided', async () => {
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      const emailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
      };

      await emailService.sendEmail(emailOptions);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'Test App <noreply@example.com>',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
        text: 'Test HTML content',
      });
    });

    it('should throw error when email sending fails', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP Error'));

      const emailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
      };

      await expect(emailService.sendEmail(emailOptions)).rejects.toThrow('Failed to send email');
    });
  });

  describe('sendInvitationEmail', () => {
    it('should send invitation email with correct template', async () => {
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      await emailService.sendInvitationEmail(
        'invitee@example.com',
        'Test Organization',
        'John Doe',
        'MEMBER',
        'test-token'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test App <noreply@example.com>',
          to: 'invitee@example.com',
          subject: "You're invited to join Test Organization",
        })
      );

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('Test Organization');
      expect(callArgs.html).toContain('John Doe');
      expect(callArgs.html).toContain('MEMBER');
      expect(callArgs.html).toContain('test-token');
      expect(callArgs.text).toContain('Test Organization');
      expect(callArgs.text).toContain('John Doe');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with correct template', async () => {
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      await emailService.sendPasswordResetEmail('user@example.com', 'reset-token');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test App <noreply@example.com>',
          to: 'user@example.com',
          subject: 'Reset Your Password',
        })
      );

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('reset-token');
      expect(callArgs.text).toContain('reset-token');
    });
  });

  describe('sendEmailVerificationEmail', () => {
    it('should send email verification email with correct template', async () => {
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      await emailService.sendEmailVerificationEmail('user@example.com', 'verify-token');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test App <noreply@example.com>',
          to: 'user@example.com',
          subject: 'Verify Your Email Address',
        })
      );

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('verify-token');
      expect(callArgs.text).toContain('verify-token');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct template', async () => {
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      await emailService.sendWelcomeEmail('user@example.com', 'John');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test App <noreply@example.com>',
          to: 'user@example.com',
          subject: 'Welcome to Our Platform!',
        })
      );

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('John');
      expect(callArgs.text).toContain('John');
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      mockTransporter.verify.mockResolvedValue(true);

      const result = await emailService.testConnection();

      expect(result).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should return false when connection fails', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

      const result = await emailService.testConnection();

      expect(result).toBe(false);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });
  });
});