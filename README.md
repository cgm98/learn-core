# LEARN-CORE

LEARN-CORE es un motor de análisis de cambios para agentes de desarrollo. Su objetivo es identificar qué comportamiento podría verse afectado por un cambio, seleccionar evidencia para verificarlo y declarar explícitamente los límites del análisis.

Este paquete contiene servicios y esquemas heredados, una consulta de impacto y un indexador TypeScript inicial. El indexador multilenguaje original sigue en `App/LEARN/server/src/infrastructure/code-index`; sus dependencias completas y el runtime web no están integrados aquí. El código heredado de `backend/` aún requiere adaptación para ejecutarse de forma independiente. LEARN-CORE no incluye frontend; una futura consola de diagnóstico puede vivir en otra aplicación y consumir su interfaz. Las metas de rendimiento y calidad de la propuesta son hipótesis de evaluación, no resultados obtenidos.

La propuesta técnica y el protocolo experimental están en [docs/propuesta-id.md](docs/propuesta-id.md). El plan para integrar el código existente está en [docs/migracion.md](docs/migracion.md).

## Arranque y migraciones

```sh
npm install
npm start
```

`npm start` crea `db/learn_code.db` y aplica las migraciones del esquema mínimo de topología cuando la base no existe. Después levanta una API local en `http://127.0.0.1:3100`: `GET /health` indica el estado y `GET /impact?domain=...&focus=...` consulta el grafo. También puede usarse `npm run db:init` para crear el esquema sin levantar el servidor.

Las migraciones aplicadas se registran en `schema_migrations`, de forma idempotente. Una base **existente y heredada** se conserva al arrancar; `npm run db:migrate` es el paso explícito para añadirle las tablas e índices nuevos. Haz una copia de esa base antes de migrarla, especialmente si está en uso. Borrar `learn_code.db` elimina su índice y cualquier dato almacenado allí: el arranque crea una base **vacía**, y después hay que ejecutar `npm run bootstrap:ts` para volver a indexar el código. No se reconstruyen automáticamente proyectos cuya ruta y `tsconfig` ya no estén disponibles en otra fuente.

## Crear un índice TypeScript nuevo

LEARN-CORE ya puede crear su propio grafo de archivos, símbolos, imports y llamadas resueltas en una **base nueva**. Requiere un proyecto con `tsconfig.json`:

```sh
npm install
npm run bootstrap:ts -- --db /ruta/nuevo-learn-code.db --domain mi-proyecto --tsconfig /ruta/proyecto/tsconfig.json
```

El comando rechaza un dominio que ya tiene archivos indexados. Para actualizar **un dominio creado por este mismo indexador y con el mismo `tsconfig`**, se añade `--refresh true`; la actualización reemplaza el grafo del dominio en una transacción y elimina relaciones de archivos retirados. No sustituye el índice heredado ni migra datos automáticamente. Este primer indexador cubre funciones, clases, métodos y funciones asignadas a variables en TypeScript. No incluye dependencias de datos, llamadas dinámicas ni todos los constructos del lenguaje. Después puede usarse `npm run impact` sobre la misma base.

## Consulta de impacto disponible

Requiere Node.js 24 o posterior. Consulta las tablas existentes `code_files`, `code_symbols` y `code_edges` de una base SQLite sin escribir en ella:

```sh
npm test
npm run impact -- --db /ruta/learn_code.db --domain mi-proyecto --focus /ruta/archivo.ts
```

`--focus` también acepta un ID de símbolo. `--depth` y `--nodes` limitan el recorrido (valores predeterminados: 3 y 100). La respuesta incluye la ruta de aristas que justifica cada posible impacto y declara cuándo el recorrido se truncó. Requiere un índice `code_edges(domain_id, to_id, edge_type)` para escalar; la migración está en [migrations/001_impact_lookup.sql](migrations/001_impact_lookup.sql). El comando no modifica la base.

Cuando el foco es un archivo, el análisis incluye sus símbolos indexados y busca los dependientes de esos símbolos, además de los imports del archivo. No equivale a demostrar que todos esos dependientes sufrirán una regresión.

## Resolución semántica de llamadas TypeScript

Sobre una base heredada puede ejecutarse una pasada **offline** con un `tsconfig.json`. Reutiliza los IDs de símbolos existentes y guarda las llamadas resueltas por el compilador en tablas separadas:

```sh
npm run semantic:index -- --db /ruta/copia-de-learn_code.db --domain mi-proyecto --tsconfig /ruta/proyecto/tsconfig.json
```

La primera ejecución crea las tablas de [migrations/002_semantic_calls.sql](migrations/002_semantic_calls.sql); las siguientes reemplazan atómicamente las aristas de ese `tsconfig`. `npm run impact` las lee automáticamente y señala `typescript_compiler` como procedencia. **Ejecutar primero sobre una copia de la base.** Esta pasada escribe en SQLite y puede competir con el indexador original si ambos comparten la base en vivo.

Solo se guardan llamadas cuyo símbolo de origen y destino se pueden asociar de forma única a `code_symbols` por archivo, nombre y línea. Las llamadas dinámicas, externas, ambiguas o sin símbolo contenedor se cuentan como no resueltas. El resultado es una capa semántica de llamadas, no un grafo completo de dependencias de datos o control.

Para medir la cobertura sin modificar SQLite:

```sh
npm run semantic:audit -- --db /ruta/learn_code.db --domain mi-proyecto --tsconfig /ruta/proyecto/tsconfig.json
```

En un directorio sin permiso para crear archivos auxiliares SQLite puede usarse `--immutable true`. Esta opción ignora cambios que aún estén en el WAL, por lo que solo sirve para inspección de una copia estable o para diagnóstico.

Una arista de dependencia señala **posible** impacto. El resultado aún no selecciona pruebas, comprueba la frescura del índice ni interpreta llamadas dinámicas.
