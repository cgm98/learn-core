import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './db-migrations.mjs';
import { SqliteImpactStore } from './sqlite-impact-store.mjs';
import { analyzeImpact } from './impact.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPath = process.env.LEARN_CODE_DB_PATH || resolve(projectRoot, 'db', 'learn_code.db');
const status = initializeDatabase(dbPath);
const store = new SqliteImpactStore(status.path);
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3100);

function json(response, code, data) {
  response.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

const server = createServer((request, response) => {
  if (request.method !== 'GET') return json(response, 405, { error: 'Método no permitido' });
  const url = new URL(request.url, `http://${host}:${port}`);
  if (url.pathname === '/health') return json(response, 200, { status: 'ok', database: status });
  if (url.pathname !== '/impact') return json(response, 404, { error: 'Ruta no encontrada' });
  try {
    const result = analyzeImpact(store, {
      domainId: url.searchParams.get('domain'),
      focusId: url.searchParams.get('focus'),
      maxDepth: url.searchParams.has('depth') ? Number(url.searchParams.get('depth')) : 3,
      maxNodes: url.searchParams.has('nodes') ? Number(url.searchParams.get('nodes')) : 100
    });
    return json(response, result.status === 'analyzed' ? 200 : 404, result);
  } catch (error) {
    return json(response, 400, { error: error.message });
  }
});

server.listen(port, host, () => {
  process.stderr.write(`LEARN-CORE listo en http://${host}:${server.address().port}; base ${status.created ? 'creada' : 'existente'}\n`);
});

function shutdown() {
  server.close(() => { store.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
