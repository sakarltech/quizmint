import {namecheapDatabase,closeNamecheapDatabase} from '../db/namecheap.mjs';
import {migrateAdminUsers} from '../db/namecheap-admin-users.mjs';
try { await migrateAdminUsers(await namecheapDatabase()); console.log('Admin user-management schema is ready. No user data changed.'); }
finally { await closeNamecheapDatabase(); }
