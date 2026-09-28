import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(project, '../..');
const root = path.join(workspace, 'work', 'clearpath-postgres');
const data = path.join(root, 'data');
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/lib/postgresql/18/bin');
const port = 55439;
function run(name, args) {
  const result = spawnSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args, { encoding: 'utf8', windowsHide: true, cwd: root });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || name + ' failed');
}
fs.mkdirSync(root, { recursive: true });
if (process.argv[2] === 'stop') {
  run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  console.log('Local Clearpath database stopped.');
  process.exit(0);
}
const credentialFile = path.join(root, 'credentials.json');
const credentials = fs.existsSync(credentialFile) ? JSON.parse(fs.readFileSync(credentialFile, 'utf8')) : {
  owner: crypto.randomBytes(32).toString('hex'), app: crypto.randomBytes(32).toString('hex'), secret: crypto.randomBytes(32).toString('hex'),
};
fs.writeFileSync(credentialFile, JSON.stringify(credentials), { mode: 0o600 });
if (!fs.existsSync(path.join(data, 'PG_VERSION'))) {
  fs.mkdirSync(data, { recursive: true });
  const pwfile = path.join(root, 'init-password');
  fs.writeFileSync(pwfile, credentials.owner, { mode: 0o600 });
  try { run('initdb', ['-D', data, '-U', 'clearpath_owner', '-A', 'scram-sha-256', '--pwfile=' + pwfile, '--encoding=UTF8', '--locale=C']); }
  finally { fs.unlinkSync(pwfile); }
}
const status = spawnSync(path.join(bin, 'pg_ctl' + (process.platform === 'win32' ? '.exe' : '')), ['-D', data, 'status'], { windowsHide: true });
if (status.status !== 0) {
  const log = fs.openSync(path.join(root, 'postgres.log'), 'a');
  const server = spawn(path.join(bin, 'postgres' + (process.platform === 'win32' ? '.exe' : '')), ['-D', data, '-p', String(port), '-h', '127.0.0.1'], { cwd: root, windowsHide: true, detached: true, stdio: ['ignore', log, log] });
  server.unref(); fs.closeSync(log);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const probe = new pg.Client({ host: '127.0.0.1', port, user: 'clearpath_owner', password: credentials.owner, database: 'postgres', connectionTimeoutMillis: 300 });
    try { await probe.connect(); ready = true; } catch { /* server is starting */ } finally { await probe.end(); }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Local database did not become ready; inspect work/clearpath-postgres/postgres.log.');
}
const base = { host: '127.0.0.1', port, user: 'clearpath_owner', password: credentials.owner };
const admin = new pg.Client({ ...base, database: 'postgres' });
await admin.connect();
if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'clearpath_app'")).rowCount) {
  // Password is cryptographically generated hex, not arbitrary user input.
  await admin.query("CREATE ROLE clearpath_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '" + credentials.app + "'");
}
for (const database of ['clearpath', 'clearpath_test']) {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount) await admin.query('CREATE DATABASE ' + database);
  const db = new pg.Client({ ...base, database });
  await db.connect();
  await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await db.query('GRANT USAGE ON SCHEMA public TO clearpath_app');
  await db.query('ALTER DEFAULT PRIVILEGES FOR ROLE clearpath_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clearpath_app');
  await db.end();
}
await admin.end();
const appUrl = (name) => 'postgresql://clearpath_app:' + credentials.app + '@127.0.0.1:' + port + '/' + name;
const ownerUrl = (name) => 'postgresql://clearpath_owner:' + credentials.owner + '@127.0.0.1:' + port + '/' + name;
const envFile = path.join(project, '.env');
if (!fs.existsSync(envFile)) fs.writeFileSync(envFile, [
  'DATABASE_URL=' + appUrl('clearpath'), 'DIRECT_URL=' + ownerUrl('clearpath'),
  'TEST_DATABASE_URL=' + appUrl('clearpath_test'), 'TEST_DIRECT_URL=' + ownerUrl('clearpath_test'),
  'APP_ORIGIN=http://127.0.0.1:3000', 'AUTH_SECRET=' + credentials.secret, '',
].join('\n'), { mode: 0o600 });
console.log('Local PostgreSQL ready on 127.0.0.1:' + port + '. Runtime role has no RLS bypass. Credentials saved privately; no financial demo data inserted.');
