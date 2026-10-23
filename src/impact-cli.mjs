import { resolve } from 'node:path';
import { analyzeImpact } from './impact.mjs';
import { SqliteImpactStore } from './sqlite-impact-store.mjs';

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || !args[i + 1]) throw new Error('Uso: npm run impact -- --db RUTA --domain ID --focus ARCHIVO_O_SIMBOLO [--depth N] [--nodes N] [--immutable true]');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.db || !options.domain || !options.focus) throw new Error('Faltan --db, --domain o --focus');
  return options;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const store = new SqliteImpactStore(resolve(args.db), { immutable: args.immutable === 'true' });
  try {
    const result = analyzeImpact(store, {
      domainId: args.domain,
      focusId: args.focus,
      maxDepth: args.depth === undefined ? 3 : Number(args.depth),
      maxNodes: args.nodes === undefined ? 100 : Number(args.nodes)
    });
    if (args.immutable === 'true') result.limitations.push('Lectura immutable: los cambios aún presentes en el WAL pueden no aparecer.');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'analyzed') process.exitCode = 2;
  } finally { store.close(); }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
