import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailConfigStatus} from '../lib/mail/config-check.mjs';
const valid={APP_URL:'https://staging.quizmint.test',SMTP_HOST:'premium50.web-hosting.com',SMTP_PORT:'465',SMTP_USER:'hello@example.test',SMTP_PASSWORD:'synthetic-private-password',SMTP_FROM_EMAIL:'hello@example.test',SMTP_FROM_NAME:'QuizMint'};
test('mail diagnostics identify failing fields without exposing values',()=>{
  assert.deepEqual(mailConfigStatus(valid),{smtpConfigured:true,originValid:true,invalidFields:[],passwordPresent:true});
  const report=mailConfigStatus({...valid,SMTP_HOST:'"premium50.web-hosting.com"',SMTP_PORT:'587',SMTP_FROM_EMAIL:'invalid sender',APP_URL:'http://untrusted.test'});
  assert.deepEqual(report.invalidFields,['SMTP_HOST','SMTP_PORT','SMTP_FROM_EMAIL']);assert.equal(report.originValid,false);assert.equal(report.smtpConfigured,false);
  assert.ok(!JSON.stringify(report).includes(valid.SMTP_PASSWORD));assert.ok(!JSON.stringify(report).includes('hello@example.test'));
  assert.ok(mailConfigStatus({}).invalidFields.includes('SMTP_PASSWORD'));
});
