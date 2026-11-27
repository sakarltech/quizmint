const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export function applicationOrigin(config, namecheap = true) {
  const url = new URL(config.APP_URL || (namecheap ? 'https://quizmint.co.uk' : 'https://www.quizmint.co.uk'));
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL must be an HTTPS origin.');
  return url.origin;
}
export function securityTemplate(subject, text, origin) {
  const candidate = text.match(/https:\/\/[^\s]+/g)?.map(link=>link.replace(/[.,;!?]+$/, '')).find(link => {
    try { const url = new URL(link); return url.origin === origin && (url.pathname === '/reset-password' || url.pathname === '/login'); } catch { return false; }
  });
  const button = candidate ? `<p style="margin:28px 0"><a href="${escape(candidate)}" style="display:inline-block;background:#17654c;color:#fff;padding:14px 22px;text-decoration:none;border-radius:8px;font-weight:bold">${candidate.includes('/reset-password') ? 'Reset password' : 'Sign in to QuizMint'}</a></p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f7f4;font-family:Arial,sans-serif;color:#173c33"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #dce8e0;border-radius:12px"><tr><td style="padding:32px"><p style="font-size:24px;font-weight:bold;color:#17654c;margin:0 0 28px">QuizMint</p><h1 style="font-size:24px;line-height:1.3">${escape(subject)}</h1>${button}<div style="font-size:15px;line-height:1.7">${text.split('\n\n').map(paragraph => `<p>${escape(paragraph).replaceAll('\n', '<br>')}</p>`).join('')}</div><p style="font-size:12px;color:#61756a;border-top:1px solid #e5eee7;padding-top:20px">An account security message from QuizMint.</p></td></tr></table></td></tr></table></body></html>`;
}
