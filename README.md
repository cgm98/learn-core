# LEARN-CORE

LEARN-CORE es un motor de análisis de cambios para agentes de desarrollo. Su objetivo es identificar qué comportamiento podría verse afectado por un cambio, seleccionar evidencia para verificarlo y declarar explícitamente los límites del análisis.

Esta copia de trabajo contiene los servicios, esquemas y vistas heredados de `L_GROUP/learn-core`, una consulta de impacto y un indexador TypeScript inicial. El indexador multilenguaje original sigue en `App/LEARN/server/src/infrastructure/code-index`; sus dependencias completas y el runtime web no están integrados aquí. Los directorios `backend/` y `frontend/` aún requieren adaptación para ejecutarse de forma independiente. Las metas de rendimiento y calidad de la propuesta son hipótesis de evaluación, no resultados obtenidos.

La propuesta técnica y el protocolo experimental están en [docs/propuesta-id.md](docs/propuesta-id.md). El plan para integrar el código existente está en [docs/migracion.md](docs/migracion.md).

---

## Requisitos del Sistema

- **Node.js**: Versión `>= 24.0.0` (requerido por el uso de `node:sqlite` / `DatabaseSync` nativo).
- **npm**: Versión `>= 10.0.0`.
- **Docker y Docker Compose** (opcional, para ejecución contenerizada): Docker Engine / Docker Desktop en ejecución.

---

## Levantar el Sistema Localmente

### 1. Instalación de dependencias

Instala los módulos del motor y dependencias nativas (`better-sqlite3`, `drizzle-orm`, `sqlite-vec`, `typescript`):

```sh
npm install
```

Para una instalación determinista basada en el `package-lock.json`:

```sh
npm ci
```

### 2. Verificación de integridad y tests

Ejecuta la suite de pruebas unitarias y de integración del grafo de topología:

```sh
npm test
```

Salida esperada:
```text
✔ lee el esquema heredado sin modificarlo
✔ recorre dependientes en dirección de impacto, conserva rutas y aísla dominios
✔ declara truncamiento y ausencia de índice
✔ crea un índice TypeScript independiente y lo consulta extremo a extremo
✔ resuelve llamadas por símbolo y elimina aristas obsoletas al reindexar
ℹ tests 5 | pass 5 | fail 0
```

### 3. Configuración de Base de Datos

El motor opera sobre SQLite en modo WAL (`journal_mode = WAL`, `synchronous = NORMAL`). Por defecto utiliza `db/learn_code.db`. Puedes configurar una ruta personalizada mediante la variable de entorno:

```sh
# Linux / macOS / Bash
export LEARN_CODE_DB_PATH="/ruta/hacia/tu/learn_code.db"

# Windows PowerShell
$env:LEARN_CODE_DB_PATH = "D:\ruta\hacia\tu\learn_code.db"
```

---

## Levantar y Ejecutar con Docker

El proyecto incluye soporte para contenedorización vía Dockerfile optimizado (basado en `node:24-bookworm-slim`) y `docker-compose.yml`.

### 1. Construir la imagen

Asegúrate de tener el daemon de Docker iniciado y ejecuta:

```sh
docker compose build
```

O utilizando directamente `docker build`:

```sh
docker build -t learn-core .
```

> **Nota de rendimiento**: La base de datos local `db/learn_code.db` está excluida del contexto de construcción mediante [.dockerignore](.dockerignore) para evitar transferencias innecesarias de cientos de megabytes. La persistencia se gestiona montando el directorio `./db` como volumen en tiempo de ejecución.

### 2. Levantar el servicio con Docker Compose

Para levantar el contenedor y ejecutar la suite de verificación por defecto:

```sh
docker compose up
```

### 3. Ejecutar comandos del motor dentro del contenedor

Puedes ejecutar cualquiera de las herramientas de análisis dentro del contenedor aislado montando la base de datos:

- **Ejecutar tests dentro del contenedor:**
  ```sh
  docker compose run --rm learn-core npm test
  ```

- **Ejecutar análisis de impacto:**
  ```sh
  docker compose run --rm learn-core npm run impact -- --db /app/db/learn_code.db --domain mi-proyecto --focus /ruta/archivo.ts
  ```

- **Indexar un proyecto TypeScript externo (montando directorio de trabajo):**
  ```sh
  docker run --rm \
    -v ${PWD}/db:/app/db \
    -v /ruta/absoluta/a/tu/codigo:/workspace:ro \
    learn-core npm run bootstrap:ts -- --db /app/db/learn_code.db --domain mi-proyecto --tsconfig /workspace/tsconfig.json
  ```

- **Abrir una terminal interactiva en el contenedor:**
  ```sh
  docker compose run --rm learn-core sh
  ```

---

## Comandos del Motor de Análisis

### 1. Crear un índice TypeScript nuevo (`bootstrap:ts`)

LEARN-CORE puede crear su propio grafo de archivos, símbolos, imports y llamadas resueltas en una **base nueva**. Requiere un proyecto con `tsconfig.json`:

```sh
npm run bootstrap:ts -- --db /ruta/nuevo-learn-code.db --domain mi-proyecto --tsconfig /ruta/proyecto/tsconfig.json
```

El comando rechaza un dominio que ya tiene archivos indexados. Para actualizar **un dominio creado por este mismo indexador y con el mismo `tsconfig`**, se añade `--refresh true`; la actualización reemplaza el grafo del dominio en una transacción y elimina relaciones de archivos retirados. No sustituye el índice heredado ni migra datos automáticamente. Este primer indexador cubre funciones, clases, métodos y funciones asignadas a variables en TypeScript. No incluye dependencias de datos, llamadas dinámicas ni todos los constructos del lenguaje. Después puede usarse `npm run impact` sobre la misma base.

### 2. Consulta de impacto (`impact`)

Consulta las tablas existentes `code_files`, `code_symbols` y `code_edges` de una base SQLite sin escribir en ella:

```sh
npm run impact -- --db /ruta/learn_code.db --domain mi-proyecto --focus /ruta/archivo.ts
```

Opciones disponibles:
- `--focus`: Acepta una ruta absoluta de archivo o un ID de símbolo.
- `--depth`: Limita la profundidad del recorrido (predeterminado: `3`).
- `--nodes`: Limita la cantidad máxima de nodos explorados (predeterminado: `100`).
- `--immutable true`: Abre SQLite en modo inmutable para entornos de solo lectura (ignora cambios pendientes en WAL).

La respuesta incluye la ruta de aristas que justifica cada posible impacto y declara cuándo el recorrido se truncó. Requiere un índice `code_edges(domain_id, to_id, edge_type)` para escalar; la migración está en [migrations/001_impact_lookup.sql](migrations/001_impact_lookup.sql). El comando no modifica la base.

Cuando el foco es un archivo, el análisis incluye sus símbolos indexados y busca los dependientes de esos símbolos, además de los imports del archivo. No equivale a demostrar que todos esos dependientes sufrirán una regresión.

### 3. Resolución semántica de llamadas TypeScript (`semantic:index`)

Sobre una base heredada puede ejecutarse una pasada **offline** con un `tsconfig.json`. Reutiliza los IDs de símbolos existentes y guarda las llamadas resueltas por el compilador en tablas separadas:

```sh
npm run semantic:index -- --db /ruta/copia-de-learn_code.db --domain mi-proyecto --tsconfig /ruta/proyecto/tsconfig.json
```

La primera ejecución crea las tablas de [migrations/002_semantic_calls.sql](migrations/002_semantic_calls.sql); las siguientes reemplazan atómicamente las aristas de ese `tsconfig`. `npm run impact` las lee automáticamente y señala `typescript_compiler` como procedencia. **Ejecutar primero sobre una copia de la base.** Esta pasada escribe en SQLite y puede competir con el indexador original si ambos comparten la base en vivo.

Solo se guardan llamadas cuyo símbolo de origen y destino se pueden asociar de forma única a `code_symbols` por archivo, nombre y línea. Las llamadas dinámicas, externas, ambiguas o sin símbolo contenedor se cuentan como no resueltas. El resultado es una capa semántica de llamadas, no un grafo completo de dependencias de datos o control.

### 4. Auditoría de cobertura semántica (`semantic:audit`)

Para medir la cobertura sin modificar SQLite:

```sh
npm run semantic:audit -- --db /ruta/learn_code.db --domain mi-proyecto --tsconfig /ruta/proyecto/tsconfig.json
```

En un directorio sin permiso para crear archivos auxiliares SQLite puede usarse `--immutable true`. Esta opción ignora cambios que aún estén en el WAL, por lo que solo sirve para inspección de una copia estable o para diagnóstico.

Una arista de dependencia señala **posible** impacto. El resultado aún no selecciona pruebas, comprueba la frescura del índice ni interpreta llamadas dinámicas.
