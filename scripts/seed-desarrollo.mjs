// scripts/seed-desarrollo.mjs
//
// Proxy de ejecucion desde la raiz del repositorio.
// Delega en frontend/scripts/seed-desarrollo.mjs manteniendo cwd en frontend.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(AQUI, '..', 'frontend');
const SCRIPT = join(FRONTEND, 'scripts', 'seed-desarrollo.mjs');

const p = spawn(process.execPath, [SCRIPT, ...process.argv.slice(2)], {
  cwd: FRONTEND,
  stdio: 'inherit',
});

p.on('exit', (code) => {
  process.exit(code ?? 0);
});
