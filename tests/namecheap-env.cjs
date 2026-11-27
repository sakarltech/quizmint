const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,chmodSync,rmSync,symlinkSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {loadPrivateEnvironment}=require('../lib/namecheap-env.cjs');
test('private dotenv fallback loads missing values, quoted # passwords and preserves overrides',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'quizmint-env-'));
  try{
    writeFileSync(path.join(root,'.env.namecheap'),"QUIZMINT_TEST_ENV_PASSWORD='synthetic#private'\nQUIZMINT_TEST_ENV_OVERRIDE=file\nQUIZMINT_TEST_ENV_BLANK=file\n",{mode:0o600});
    const code=`const assert=require('node:assert/strict');const {loadPrivateEnvironment}=require(${JSON.stringify(require.resolve('../lib/namecheap-env.cjs'))});assert.equal(loadPrivateEnvironment(${JSON.stringify(root)}),true);assert.equal(process.env.QUIZMINT_TEST_ENV_PASSWORD,'synthetic#private');assert.equal(process.env.QUIZMINT_TEST_ENV_OVERRIDE,'hosting');assert.equal(process.env.QUIZMINT_TEST_ENV_BLANK,'');`;
    const child=spawnSync(process.execPath,['-e',code],{env:{...process.env,QUIZMINT_TEST_ENV_OVERRIDE:'hosting',QUIZMINT_TEST_ENV_BLANK:''},encoding:'utf8'});
    assert.equal(child.status,0,'Private env fallback assertions failed');
    chmodSync(path.join(root,'.env.namecheap'),0o644);
    assert.throws(()=>loadPrivateEnvironment(root),{code:'QUIZMINT_ENV_PERMISSIONS'});
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('missing private file is optional; symlinks are rejected',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'quizmint-env-'));
  try{
    assert.equal(loadPrivateEnvironment(root),false);
    writeFileSync(path.join(root,'other'),'APP_URL=https://example.test',{mode:0o600});
    symlinkSync(path.join(root,'other'),path.join(root,'.env.namecheap'));
    assert.throws(()=>loadPrivateEnvironment(root),{code:'QUIZMINT_ENV_PERMISSIONS'});
  }finally{rmSync(root,{recursive:true,force:true});}
});
