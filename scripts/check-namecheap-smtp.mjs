import { smtpMailer } from '../lib/mail/smtp.mjs';
import { securityTemplate, applicationOrigin } from '../lib/mail/security-template.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--send')) throw new Error('Usage: npm run mail:check:namecheap -- [--send recipient@example.com]');
  const mailer = await smtpMailer();
  if (!args.length) {
    await mailer.verify();
    console.log('SMTP TLS connection and authentication succeeded. No email sent.');
  } else {
    const subject = 'QuizMint direct SMTP test';
    const text = 'QuizMint is sending this test email directly from the Namecheap Node.js application. No PHP gateway is involved.';
    await mailer.send({ to: args[1], subject, text, html: securityTemplate(subject, text, applicationOrigin(process.env)), id: 'smtp-test/' + crypto.randomUUID() });
    console.log('Test email accepted by SMTP. Check the recipient inbox and spam folder.');
  }
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  if (/^Usage:/.test(error?.message || '')) console.error(error.message);
  else console.error(`SMTP check failed${code ? ` (${code})` : ''}. Check private mailbox settings and TLS; credentials and SMTP responses are not printed.`);
  process.exitCode = 1;
}
