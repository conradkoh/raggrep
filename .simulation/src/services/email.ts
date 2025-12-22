/**
 * Email Service
 *
 * Handles sending emails for notifications, password resets, and welcome messages.
 * Uses templates for consistent styling across all emails.
 */

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplate {
  subject: string;
  render: (data: Record<string, unknown>) => string;
}

// Email templates
const templates: Record<string, EmailTemplate> = {
  welcome: {
    subject: "Welcome to Our Platform!",
    render: (data) => `
      <h1>Welcome, ${data.firstName}!</h1>
      <p>Thank you for joining our platform. We're excited to have you!</p>
      <p>Get started by exploring your dashboard.</p>
      <a href="${data.dashboardUrl}">Go to Dashboard</a>
    `,
  },

  passwordReset: {
    subject: "Password Reset Request",
    render: (data) => `
      <h1>Password Reset</h1>
      <p>We received a request to reset your password.</p>
      <p>Click the link below to set a new password:</p>
      <a href="${data.resetUrl}">Reset Password</a>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  },

  emailVerification: {
    subject: "Verify Your Email",
    render: (data) => `
      <h1>Verify Your Email</h1>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${data.verificationUrl}">Verify Email</a>
      <p>This link expires in 24 hours.</p>
    `,
  },
};

let emailConfig: EmailConfig | null = null;

/**
 * Initialize the email service
 */
export function initializeEmailService(config: EmailConfig): void {
  emailConfig = config;
}

/**
 * Send an email
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!emailConfig) {
    throw new Error("Email service not initialized");
  }

  // In a real implementation, this would use nodemailer or similar
  console.log("Sending email:", {
    from: emailConfig.from,
    to: message.to,
    subject: message.subject,
  });

  // Simulate sending
  return true;
}

/**
 * Send an email using a template
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const template = templates[templateName];

  if (!template) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const html = template.render(data);
  const subject = template.subject;

  return sendEmail({
    to,
    subject,
    html,
  });
}

/**
 * Send a welcome email to a new user
 */
export async function sendWelcomeEmail(
  email: string,
  firstName: string,
  dashboardUrl: string
): Promise<boolean> {
  return sendTemplateEmail("welcome", email, {
    firstName,
    dashboardUrl,
  });
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<boolean> {
  return sendTemplateEmail("passwordReset", email, {
    resetUrl,
  });
}

/**
 * Send an email verification email
 */
export async function sendVerificationEmail(
  email: string,
  verificationUrl: string
): Promise<boolean> {
  return sendTemplateEmail("emailVerification", email, {
    verificationUrl,
  });
}





