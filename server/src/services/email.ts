/* eslint-disable @typescript-eslint/no-var-requires */
import { loadEnv } from '../utils/loadEnv';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'email' });
loadEnv();

type MailTransporter = {
  sendMail: (options: Record<string, unknown>) => Promise<unknown>;
  verify?: () => Promise<unknown>;
};

interface SmtpConfig {
  service?: 'gmail';
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
}

let nodemailer: { createTransport: (config: SmtpConfig) => MailTransporter } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  nodemailer = require('nodemailer');
} catch (error) {
  log.warn({ err: error instanceof Error ? error.message : error }, '⚠️ nodemailer module not found. Email sending disabled.');
}

const useMailhog = process.env.USE_MAILHOG === '1';

const getBaseSmtpConfig = (): SmtpConfig => {
  if (useMailhog) {
    return {
      host: process.env.MAILHOG_HOST || '127.0.0.1',
      port: Number(process.env.MAILHOG_SMTP_PORT || 1025),
      secure: false,
      connectionTimeout: Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000),
      greetingTimeout: Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000),
      socketTimeout: Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000),
    };
  }

  return {
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER || '',
      pass: process.env.GMAIL_APP_PASSWORD || '',
    },
    connectionTimeout: Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000),
    greetingTimeout: Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000),
    socketTimeout: Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000),
  };
};

let smtpConfig: SmtpConfig = getBaseSmtpConfig();

let currentFrontendUrl = process.env.FRONTEND_URL || 'https://mindworkflow.com';

let transporter: MailTransporter | null = null;

function getTransporter(): MailTransporter | null {
  if (!nodemailer) {
    log.warn('⚠️ nodemailer is unavailable. Email sending disabled.');
    return null;
  }

  if (!transporter) {
    if (!useMailhog) {
      if (!smtpConfig.auth?.user || !smtpConfig.auth?.pass) {
        log.warn('⚠️ Gmail credentials not configured. Email sending disabled.');
        return null;
      }
    }

    transporter = nodemailer.createTransport(smtpConfig);
  }

  if (!transporter) {
    log.warn('⚠️ nodemailer transporter could not be created.');
  }
  return transporter;
}

// Email templates
const EMAIL_TEMPLATES = {
  welcome: (name: string, email: string) => {
    const frontendUrl = currentFrontendUrl;
    return {
      subject: '🎉 Добро пожаловать в MindWorkflow!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4f46e5; margin: 0;">🧠 MindWorkflow</h1>
            <p style="color: #6b7280; margin: 5px 0;">Платформа для творческих AI-workflows</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%); padding: 30px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h2 style="margin: 0 0 10px 0;">Добро пожаловать, ${name}! 🎉</h2>
            <p style="margin: 0; opacity: 0.9;">Ваш аккаунт успешно создан</p>
          </div>

          <div style="background: #f9fafb; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
            <h3 style="color: #111827; margin: 0 0 15px 0;">🚀 Что вас ждет:</h3>
            <ul style="color: #374151; margin: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">🧠 <strong>AI Node Generation</strong> - Создавайте контент с помощью ИИ</li>
              <li style="margin-bottom: 8px;">🗺️ <strong>Mind Mapping</strong> - Визуализируйте свои идеи</li>
              <li style="margin-bottom: 8px;">🔗 <strong>Node Connections</strong> - Стройте сложные workflows</li>
              <li style="margin-bottom: 8px;">📊 <strong>Project Management</strong> - Управляйте проектами</li>
            </ul>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${frontendUrl}" 
               style="display: inline-block; background: #4338ca; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              🌟 Начать работу
            </a>
          </div>

          <div style="background: #e0e7ff; border: 1px solid #4338ca; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; color: #312e81; font-size: 14px;">
              <strong>💡 Совет:</strong> Начните с создания вашего первого проекта и экспериментируйте с различными типами узлов!
            </p>
          </div>

          <div style="text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
            <p style="margin: 0;">Ваш email: <strong>${email}</strong></p>
            <p style="margin: 5px 0 0 0;">Если у вас есть вопросы, мы всегда готовы помочь!</p>
          </div>
        </div>
      `,
      text: `
Добро пожаловать в MindWorkflow, ${name}!

Ваш аккаунт успешно создан. Теперь вы можете:
- Создавать AI-узлы для генерации контента
- Строить mind maps и сложные workflows  
- Управлять проектами
- И многое другое!

Начните работу: ${frontendUrl}
Ваш email: ${email}

Удачи в творчестве!
Команда MindWorkflow
      `,
    };
  },

  resetPassword: (name: string, resetToken: string, email: string) => {
    const frontendUrl = currentFrontendUrl;
    return {
      subject: '🔐 Восстановление пароля MindWorkflow',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4f46e5; margin: 0;">🧠 MindWorkflow</h1>
            <p style="color: #6b7280; margin: 5px 0;">Восстановление пароля</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%); padding: 30px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h2 style="margin: 0 0 10px 0;">🔐 Восстановление пароля</h2>
            <p style="margin: 0; opacity: 0.9;">Привет, ${name}!</p>
          </div>

          <div style="background: #f9fafb; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
            <p style="color: #374151; margin: 0 0 20px 0;">
              Мы получили запрос на восстановление пароля для вашего аккаунта.<br>
              Если это были не вы, просто проигнорируйте это письмо.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/reset-password?token=${resetToken}" 
                 style="display: inline-block; background: #4338ca; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                🔑 Сбросить пароль
              </a>
            </div>

            <p style="color: #6b7280; font-size: 14px; margin: 20px 0 0 0;">
              Или скопируйте эту ссылку в браузер:<br>
              <code style="background: #e0e7ff; padding: 2px 4px; border-radius: 3px; font-size: 12px; color: #312e81;">
                ${frontendUrl}/reset-password?token=${resetToken}
              </code>
            </p>
          </div>

          <div style="background: #e0e7ff; border: 1px solid #4338ca; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; color: #312e81; font-size: 14px;">
              <strong>⚠️ Важно:</strong> Ссылка действительна только 1 час. После этого нужно будет запросить новую.
            </p>
          </div>

          <div style="text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
            <p style="margin: 0;">Ваш email: <strong>${email}</strong></p>
            <p style="margin: 5px 0 0 0;">Если у вас проблемы с восстановлением, обратитесь в поддержку.</p>
          </div>
        </div>
      `,
      text: `
Восстановление пароля MindWorkflow

Привет, ${name}!

Мы получили запрос на восстановление пароля для вашего аккаунта.
Если это были не вы, просто проигнорируйте это письмо.

Для сброса пароля перейдите по ссылке:
${frontendUrl}/reset-password?token=${resetToken}

⚠️ Ссылка действительна только 1 час.

Ваш email: ${email}

С уважением,
Команда MindWorkflow
      `,
    };
  },
};

// Email service functions
export const emailService = {
  // Send welcome email after registration
  async sendWelcomeEmail(name: string, email: string): Promise<boolean> {
    const mailer = getTransporter();
    if (!mailer) {
      log.info('📧 Welcome email skipped (no Gmail config) %s', email);
      return false;
    }

    try {
      const template = EMAIL_TEMPLATES.welcome(name, email);
      await mailer.sendMail({
        from: `"MindWorkflow" <${smtpConfig.auth?.user || 'no-reply@mailhog.local'}>`,
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      log.info('✅ Welcome email sent successfully to %s', email);
      return true;
    } catch (error) {
      log.error({ err: error }, '❌ Failed to send welcome email');
      return false;
    }
  },

  // Send password reset email
  async sendPasswordResetEmail(name: string, email: string, resetToken: string): Promise<boolean> {
    const mailer = getTransporter();
    if (!mailer) {
      log.info('📧 Password reset email skipped (no Gmail config) %s', email);
      return false;
    }

    try {
      const template = EMAIL_TEMPLATES.resetPassword(name, resetToken, email);
      await mailer.sendMail({
        from: `"MindWorkflow Support" <${smtpConfig.auth?.user || 'support@mailhog.local'}>`,
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      log.info('✅ Password reset email sent successfully to %s', email);
      return true;
    } catch (error) {
      log.error({ err: error }, '❌ Failed to send password reset email');
      return false;
    }
  },

  // Test email configuration
  async testEmailConfig(): Promise<{ ok: boolean; error?: string }> {
    const mailer = getTransporter();
    if (!mailer) {
      return { ok: false, error: 'SMTP не настроен' };
    }
    if (typeof mailer.verify !== 'function') {
      log.warn('⚠️ mailer.verify unavailable; skipping SMTP verification.');
      return { ok: false, error: 'SMTP транспорт не поддерживает проверку' };
    }

    let timeoutId: NodeJS.Timeout | undefined;
    try {
      const verifyTimeoutMs = Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000);
      const TIMEOUT_ERROR = new Error('SMTP_VERIFY_TIMEOUT');
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(TIMEOUT_ERROR), verifyTimeoutMs);
      });

      await Promise.race([mailer.verify(), timeoutPromise]);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      log.info('✅ Gmail SMTP connection verified successfully');
      return { ok: true };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (error instanceof Error && error.message === 'SMTP_VERIFY_TIMEOUT') {
        return {
          ok: false,
          error: `Проверка SMTP превысила ${Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 8000) / 1000} секунд`,
        };
      }
      log.error({ err: error }, '❌ Gmail SMTP connection failed');
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Не удалось подключиться к SMTP',
      };
    }
  },
};

// Export configuration check
export const isEmailConfigured = (): boolean => {
  if (useMailhog) {
    return true;
  }
  return !!(smtpConfig.auth?.user && smtpConfig.auth?.pass);
};

export interface EmailSettingsPayload {
  gmailUser: string;
  gmailAppPassword?: string;
  frontendUrl?: string;
}

export function getEmailSettingsSummary(): {
  gmailUser: string;
  frontendUrl: string;
  gmailConfigured: boolean;
} {
  return {
    gmailUser: smtpConfig.auth?.user ?? '',
    frontendUrl: currentFrontendUrl,
    gmailConfigured: isEmailConfigured(),
  };
}

export function applyEmailSettings(payload: EmailSettingsPayload): void {
  if (payload.gmailUser !== undefined) {
    smtpConfig = {
      ...smtpConfig,
      auth: {
        ...(smtpConfig.auth ?? { user: '', pass: '' }),
        user: payload.gmailUser.trim(),
        pass: payload.gmailAppPassword
          ? payload.gmailAppPassword.trim()
          : smtpConfig.auth?.pass ?? '',
      },
    };
    process.env.GMAIL_USER = smtpConfig.auth?.user ?? '';
    if (payload.gmailAppPassword) {
        process.env.GMAIL_APP_PASSWORD = smtpConfig.auth?.pass ?? '';
    }
    if (!payload.gmailUser) {
      delete process.env.GMAIL_USER;
    }
    if (!payload.gmailAppPassword) {
      delete process.env.GMAIL_APP_PASSWORD;
    }
    transporter = null; // reset transporter so it recreates with updated credentials
  }

  if (payload.frontendUrl) {
    currentFrontendUrl = payload.frontendUrl.trim() || currentFrontendUrl;
    process.env.FRONTEND_URL = currentFrontendUrl;
  }
}

export function getFrontendUrl(): string {
  return currentFrontendUrl;
}

export function refreshSmtpConfig(): void {
  smtpConfig = getBaseSmtpConfig();
  transporter = null;
}
