// Portable task launcher for shells that cannot set their working directory.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const child = spawn(process.execPath, [npm, ...process.argv.slice(2)], { cwd, stdio: 'inherit', windowsHide: true });
child.on('exit', (code) => process.exit(code ?? 1));
