import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as path from 'path';

// Ruta dedicada para learn_code.db
const dbPath = process.env.LEARN_CODE_DB_PATH || path.resolve(__dirname, '../../../db/learn_code.db');

export const sqlite = new Database(dbPath);
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');

// Cargar extensión sqlite-vec para vectores de símbolos de código (code_symbol_vectors)
try {
  sqliteVec.load(sqlite);
} catch (e) {
  console.warn('sqlite-vec warning in learn-core:', (e as Error).message);
}

export const db = drizzle(sqlite);
