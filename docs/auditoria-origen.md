# Auditoría del código recibido (2026-10-23)

Fuentes leídas:

- `D:/TRABAJO/DESARROLLO DE SOFTWARE/CHRISTIAN/PROYECTOS/WEB/JS/L_GROUP/learn-core`
- `D:/TRABAJO/DESARROLLO DE SOFTWARE/CHRISTIAN/PROYECTOS/WEB/JS/App/LEARN/server/src/infrastructure/code-index`

## Hallazgos comprobados

1. `L_GROUP/learn-core` contiene esquemas, servicios, controladores y vistas, pero **no** contiene `indexer.service.ts`, pese a que su README lo enumera como componente. El indexador está en la aplicación mayor `App/LEARN`.
2. El indexador original ya usa Tree-Sitter, hashes de archivo, watcher, conciliación de archivos eliminados y una etapa separada de referencias mediante `tsserver`. Por tanto, la siguiente investigación debe medir precisión y actualización incremental sobre esa base antes de reemplazarla.
3. El importador crea aristas `IMPORTS` solo si el archivo destino ya está indexado. El propio comentario del código reconoce que el orden de indexación puede dejar aristas ausentes hasta una indexación posterior.
4. El índice de código mezcla IDs de archivo y símbolo en `code_edges`. Las consultas deben comprobar el dominio, tipo de arista y dirección. El endpoint actual `callers` suma símbolos homónimos por nombre y consulta aristas entrantes sin `domain_id`; eso puede ampliar indebidamente los resultados cuando los IDs o nombres se repiten entre proyectos.
5. `L_GROUP/learn-core/db/learn_code.db` medía **450.564.096 bytes** al inspeccionarla. El README original fija una meta de `< 50 MB`; no hay base para afirmar que se cumple. El contenido de esa base no se copió ni modificó.
6. El `package.json` original ejecuta un mensaje de prueba pendiente en lugar de pruebas reales. Este workspace añade tres pruebas de la consulta de impacto sobre un esquema SQLite compatible.
7. En `App/LEARN/mcp-server/src/tools/unified-mcp-suite.ts`, `learn_diagnose` construye una matriz densa `n × n` de símbolos y calcula una distribución estacionaria sobre aristas de código. Esto puede consumir mucha memoria al crecer `n` y **no utiliza co-cambios de Git**. El nombre `markov_fragility` y el porcentaje de fragilidad deben tratarse como etiquetas experimentales, no como probabilidades validadas de regresión. Conviene sustituir esa ruta por una representación dispersa y medirla antes de hacerla parte del diagnóstico principal.

## Alcance del cambio realizado

La nueva consulta recorre `CALLS`, `IMPORTS`, `REFERENCES` y `EXTENDS` en sentido inverso: si A depende de B, un cambio en B puede afectar A. Devuelve la ruta de evidencia, limita profundidad y cantidad de nodos, aísla proyectos por dominio y comunica truncamiento o ausencia del nodo. Es una base de impacto potencial, no un SDG ni un detector de regresiones.

La pasada semántica TypeScript nueva convive con las aristas heredadas y conserva su procedencia. Solo resuelve llamadas que pueden asociarse inequívocamente a dos símbolos ya indexados; `unresolved` no debe interpretarse como defectos del código. Quedan pendientes la extracción del indexador Tree-Sitter y sus dependencias, la integración en HTTP/MCP, la asociación de pruebas a símbolos, la comprobación de frescura frente a Git y la evaluación experimental. La base original no pudo abrirse en modo SQLite normal de solo lectura desde este entorno; sí se pudo inspeccionar con `immutable=1`, que puede omitir cambios pendientes en el WAL. Las pruebas automatizadas usan bases temporales compatibles con el esquema.
