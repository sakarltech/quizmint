import { smtpOptions, smtpEnabled } from './smtp.mjs';
import { applicationOrigin } from './security-template.mjs';
const keys = ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM_EMAIL','SMTP_FROM_NAME'];
export function mailConfigStatus(config) {
  // Fixed valid baseline isolates each field using the actual SMTP validator.
  // Return field names/booleans only, never settings or password fingerprints.
  const baseline = { SMTP_HOST:'smtp.example.test',SMTP_PORT:'465',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'diagnostic-placeholder',SMTP_FROM_EMAIL:'sender@example.test',SMTP_FROM_NAME:'QuizMint' };
  const invalidFields = keys.filter(key => {
    try { smtpOptions({ ...baseline, [key]:config[key] }); return false; } catch { return true; }
  });
  let originValid = true;
  try { applicationOrigin(config, true); } catch { originValid = false; }
  return { smtpConfigured:smtpEnabled(config), originValid, invalidFields, passwordPresent:typeof config.SMTP_PASSWORD==='string'&&config.SMTP_PASSWORD.length>0 };
}
