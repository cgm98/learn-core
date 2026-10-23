import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './db-migrations.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultDb = resolve(projectRoot, 'db', 'learn_code.db');
const args = process.argv.slice(2);
const migrateExisting = args.includes('--migrate-existing');
const dbArg = args.indexOf('--db');
if (dbArg >= 0 && !args[dbArg + 1]) throw new Error('--db requiere una ruta');
const dbPath = dbArg >= 0 ? args[dbArg + 1] : process.env.LEARN_CODE_DB_PATH || defaultDb;
const result = initializeDatabase(dbPath, { migrateExisting });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
