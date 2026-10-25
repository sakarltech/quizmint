import { createHash } from 'node:crypto';

const address = value => typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
export function smtpOptions(config = process.env) {
  if (typeof config.SMTP_HOST !== 'string' || !/^[a-z0-9.-]+$/i.test(config.SMTP_HOST) || Number(config.SMTP_PORT || 465) !== 465 || !address(config.SMTP_USER) || typeof config.SMTP_PASSWORD !== 'string' || !config.SMTP_PASSWORD) throw new Error('SMTP is not configured.');
  const sender = config.SMTP_FROM_EMAIL || config.SMTP_USER;
  const name = config.SMTP_FROM_NAME || 'QuizMint';
  if (!address(sender) || typeof name !== 'string' || name.length > 80 || /[\r\n]/.test(name)) throw new Error('SMTP sender is invalid.');
  return {
    transport: { host: config.SMTP_HOST, port: 465, secure: true, auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true },
    sender: { name, address: sender },
  };
}
export function smtpEnabled(config = process.env) { try { smtpOptions(config); return true; } catch { return false; } }
export async function smtpMailer(config = process.env, factory) {
  const options = smtpOptions(config);
  const createTransport = factory || (await import('nodemailer')).default.createTransport;
  const transport = createTransport(options.transport);
  return {
    verify: () => transport.verify(),
    async send({ to, subject, text, html, id }) {
      if (!address(to) || typeof subject !== 'string' || !subject || subject.length > 200 || /[\r\n]/.test(subject) || typeof text !== 'string' || !text || (html !== undefined && typeof html !== 'string')) throw new Error('Invalid email message.');
      const messageId = createHash('sha256').update(String(id)).digest('hex');
      const result = await transport.sendMail({ from: options.sender, to: { address: to }, subject, text, ...(html ? { html } : {}),
        messageId: `<${messageId}@${options.sender.address.split('@')[1]}>`, disableFileAccess: true, disableUrlAccess: true });
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Email was not accepted by SMTP.');
    },
  };
}
