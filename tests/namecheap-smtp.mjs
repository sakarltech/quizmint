import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smtpOptions, smtpEnabled, smtpMailer } from '../lib/mail/smtp.mjs';
import { securityTemplate, applicationOrigin } from '../lib/mail/security-template.mjs';
const config={SMTP_HOST:'mail.quizmint.co.uk',SMTP_PORT:'465',SMTP_USER:'hello@quizmint.co.uk',SMTP_PASSWORD:'synthetic-secret'};

test('SMTP requires credentials, TLS on 465 and a valid fixed sender',()=>{
  assert.equal(smtpEnabled(config),true);
  assert.equal(smtpEnabled({...config,SMTP_PASSWORD:''}),false);
  assert.equal(smtpEnabled({...config,SMTP_PORT:'25'}),false);
  assert.equal(smtpEnabled({...config,SMTP_FROM_NAME:'QuizMint\r\nBcc: other@example.com'}),false);
  const {transport,sender}=smtpOptions(config);
  assert.equal(transport.secure,true);assert.equal(transport.port,465);
  assert.equal(transport.tls.rejectUnauthorized,true);
  assert.equal(transport.disableFileAccess,true);assert.equal(transport.disableUrlAccess,true);
  assert.equal(transport.logger,false);assert.equal(transport.debug,false);
  assert.deepEqual(sender,{name:'QuizMint',address:'hello@quizmint.co.uk'});
});

test('SMTP sends both body formats with a private deterministic message id, and rejects header injection',async()=>{
  const messages=[];
  const mailer=await smtpMailer(config,options=>({verify:async()=>true,sendMail:async message=>{messages.push(message);return {accepted:['test@example.com'],rejected:[]};}}));
  await mailer.verify();
  await mailer.send({to:'test@example.com',subject:'Reset password',text:'Plain text',html:'<p>HTML</p>',id:'secret-token-reference'});
  const message=messages[0];assert.equal(message.text,'Plain text');assert.equal(message.html,'<p>HTML</p>');
  assert.ok(!message.messageId.includes('secret-token-reference'));
  assert.deepEqual(message.to,{address:'test@example.com'});
  await assert.rejects(mailer.send({to:'test@example.com\r\nBcc: other@example.com',subject:'Test',text:'Text',id:'x'}),/Invalid/);
  await assert.rejects(mailer.send({to:'test@example.com',subject:'Test\r\nBcc: other',text:'Text',id:'x'}),/Invalid/);
  assert.equal(messages.length,1);
});

test('SMTP rejection/transport errors propagate without automatic retries',async()=>{
  let calls=0;
  const mailer=await smtpMailer(config,()=>({sendMail:async()=>{calls++;return {accepted:[],rejected:['test@example.com']};}}));
  await assert.rejects(mailer.send({to:'test@example.com',subject:'Test',text:'Text',id:'id'}),/not accepted/);
  assert.equal(calls,1);
});

test('trusted origins and HTML templates cannot inject markup or external buttons',()=>{
  assert.equal(applicationOrigin({}), 'https://quizmint.co.uk');
  assert.throws(()=>applicationOrigin({APP_URL:'http://example.com'}),/HTTPS/);
  assert.throws(()=>applicationOrigin({APP_URL:'https://user:secret@example.com'}),/HTTPS/);
  const html=securityTemplate('<img src=x>','Hello <script>alert(1)</script>\n\nhttps://quizmint.co.uk/reset-password#token=fake','https://quizmint.co.uk');
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Reset password</a>'));
  const hostile=securityTemplate('Test','https://evil.test/reset-password#token=fake','https://quizmint.co.uk');
  assert.ok(!hostile.includes('<a href='));
});
