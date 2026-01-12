import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    });
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(
        { 
          to: options.to, 
          subject: options.subject,
          messageId: result.messageId 
        }, 
        'Email sent successfully'
      );
    } catch (error) {
      logger.error(
        { 
          error: error instanceof Error ? error.message : 'Unknown error',
          to: options.to,
          subject: options.subject 
        }, 
        'Failed to send email'
      );
      throw new Error('Failed to send email');
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    
    const template = this.getPasswordResetTemplate(resetUrl);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send email verification email
   */
  async sendEmailVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    
    const template = this.getEmailVerificationTemplate(verificationUrl);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send organization invitation email
   */
  async sendInvitationEmail(
    email: string, 
    organizationName: string, 
    inviterName: string, 
    role: string, 
    token: string
  ): Promise<void> {
    const invitationUrl = `${env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${token}`;
    
    const template = this.getInvitationTemplate(organizationName, inviterName, role, invitationUrl);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const template = this.getWelcomeTemplate(firstName);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Get organization invitation email template
   */
  private getInvitationTemplate(
    organizationName: string, 
    inviterName: string, 
    role: string, 
    invitationUrl: string
  ): EmailTemplate {
    const subject = `You're invited to join ${organizationName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #17a2b8; 
              color: white; 
              text-decoration: none; 
              border-radius: 4px; 
              margin: 20px 0;
            }
            .role-badge {
              display: inline-block;
              padding: 4px 8px;
              background-color: #e9ecef;
              color: #495057;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .footer { 
              background-color: #f8f9fa; 
              padding: 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You're Invited!</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <span class="role-badge">${role}</span>.</p>
              <p>Click the button below to accept the invitation and create your account:</p>
              <a href="${invitationUrl}" class="button">Accept Invitation</a>
              <p>Or copy and paste this link into your browser:</p>
              <p><a href="${invitationUrl}">${invitationUrl}</a></p>
              <p>This invitation will expire in 7 days for security reasons.</p>
              <p>If you don't want to join this organization, you can safely ignore this email.</p>
              <p>Best regards,<br>The Team</p>
            </div>
            <div class="footer">
              <p>If you're having trouble clicking the button, copy and paste the URL into your web browser.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
You're Invited to Join ${organizationName}

Hello,

${inviterName} has invited you to join ${organizationName} as a ${role}.

To accept the invitation and create your account, visit this link:
${invitationUrl}

This invitation will expire in 7 days for security reasons.

If you don't want to join this organization, you can safely ignore this email.

Best regards,
The Team
    `;

    return { subject, html, text };
  }

  /**
   * Get password reset email template
   */
  private getPasswordResetTemplate(resetUrl: string): EmailTemplate {
    const subject = 'Reset Your Password';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #007bff; 
              color: white; 
              text-decoration: none; 
              border-radius: 4px; 
              margin: 20px 0;
            }
            .footer { 
              background-color: #f8f9fa; 
              padding: 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
              <p>To reset your password, click the button below:</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <p>Or copy and paste this link into your browser:</p>
              <p><a href="${resetUrl}">${resetUrl}</a></p>
              <p>This link will expire in 1 hour for security reasons.</p>
              <p>Best regards,<br>The Team</p>
            </div>
            <div class="footer">
              <p>If you're having trouble clicking the button, copy and paste the URL into your web browser.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Password Reset Request

Hello,

We received a request to reset your password. If you didn't make this request, you can safely ignore this email.

To reset your password, visit this link:
${resetUrl}

This link will expire in 1 hour for security reasons.

Best regards,
The Team
    `;

    return { subject, html, text };
  }

  /**
   * Get email verification template
   */
  private getEmailVerificationTemplate(verificationUrl: string): EmailTemplate {
    const subject = 'Verify Your Email Address';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #28a745; 
              color: white; 
              text-decoration: none; 
              border-radius: 4px; 
              margin: 20px 0;
            }
            .footer { 
              background-color: #f8f9fa; 
              padding: 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome! Please Verify Your Email</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>Thank you for signing up! To complete your registration, please verify your email address by clicking the button below:</p>
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
              <p>Or copy and paste this link into your browser:</p>
              <p><a href="${verificationUrl}">${verificationUrl}</a></p>
              <p>This link will expire in 24 hours for security reasons.</p>
              <p>If you didn't create an account, you can safely ignore this email.</p>
              <p>Best regards,<br>The Team</p>
            </div>
            <div class="footer">
              <p>If you're having trouble clicking the button, copy and paste the URL into your web browser.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Welcome! Please Verify Your Email

Hello,

Thank you for signing up! To complete your registration, please verify your email address by visiting this link:
${verificationUrl}

This link will expire in 24 hours for security reasons.

If you didn't create an account, you can safely ignore this email.

Best regards,
The Team
    `;

    return { subject, html, text };
  }

  /**
   * Get welcome email template
   */
  private getWelcomeTemplate(firstName: string): EmailTemplate {
    const subject = 'Welcome to Our Platform!';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .footer { 
              background-color: #f8f9fa; 
              padding: 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Our Platform!</h1>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              <p>Welcome to our platform! We're excited to have you on board.</p>
              <p>Your account has been successfully created and verified. You can now start using all the features available to you.</p>
              <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
              <p>Best regards,<br>The Team</p>
            </div>
            <div class="footer">
              <p>Thank you for choosing our platform!</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Welcome to Our Platform!

Hello ${firstName},

Welcome to our platform! We're excited to have you on board.

Your account has been successfully created and verified. You can now start using all the features available to you.

If you have any questions or need assistance, please don't hesitate to contact our support team.

Best regards,
The Team
    `;

    return { subject, html, text };
  }

  /**
   * Convert HTML to plain text (basic implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Test email connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' }, 
        'Email service connection failed'
      );
      return false;
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();