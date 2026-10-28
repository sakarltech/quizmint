const fs = require('node:fs');
const path = require('node:path');
function loadPrivateEnvironment(appRoot, runtime = process) {
  const filename = path.join(appRoot, '.env.namecheap');
  let stat;
  try { stat = fs.lstatSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    const error = new Error('Private environment file must be a regular file with mode 600.');
    error.code = 'QUIZMINT_ENV_PERMISSIONS'; throw error;
  }
  // Node's native parser handles quoted passwords and # characters. Existing
  // process/cPanel values (including intentional blanks) retain precedence.
  runtime.loadEnvFile(filename);
  return true;
}
module.exports = { loadPrivateEnvironment };
