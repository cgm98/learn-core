# Migración del proyecto existente

El código de `L_GROUP/learn-core` se copió a este workspace sin la base de datos. El indexador original se encuentra en `App/LEARN/server/src/infrastructure/code-index` y aún no se ha movido. Las bases de datos originales no se han alterado.

1. Inventariar los contratos de `backend/src/schemas`, `backend/src/services` y las cuatro vistas del frontend. Registrar dependencias, pruebas y consumidores de cada servicio. Este código conserva imports hacia la estructura mayor de LEARN que habrá que desacoplar.
2. Medir el indexador Node actual en las mismas operaciones y repositorios previstos para el motor nuevo. Conservar scripts, datos de entrada y resultados brutos.
3. La primera consulta de impacto (`src/impact.mjs`) ya separa recorrido y almacenamiento y lee el esquema SQLite existente. Integrarla en el servicio web y MCP conservando contratos de respuesta; sustituir la lectura global del grafo cuando se consulta un foco.
4. Ya existe una primera pasada semántica offline con el compilador TypeScript (`src/typescript-semantic.mjs`) para llamadas que coinciden inequívocamente con símbolos heredados. Reemplaza de forma atómica las aristas de cada `tsconfig` y elimina las que desaparecen al reindexar. Medir su cobertura de resolución y añadir actualización por archivo antes de conectarla al watcher. Aplicar los índices SQL en una copia de la base y medir el plan de consulta antes de producción.

Un bootstrap independiente (`src/typescript-bootstrap.mjs`) también crea archivos, símbolos, imports y llamadas en una base nueva. Rechaza dominios ya indexados, de modo que la migración de datos existentes requiere un procedimiento explícito de comparación y cambio de consumidor.

La primera medición de esa pasada sobre LEARN está en `semantic-audit-2026-10-23.md`. Su recuento bruto de llamadas no mide precisión ni exhaustividad, porque incluye llamadas a código externo y dinámico.
5. Migrar `indexer.service.ts` y las consultas de `CodeExplorer` y `ProjectIntelligence` al nuevo módulo. Las vistas deben mostrar tanto rutas de evidencia como límites del análisis.
6. Añadir cobertura por prueba y evaluar A1/A2/A3 según `propuesta-id.md` antes de activar recomendaciones automáticas en `learn_diagnose`.
7. Perfilar el sistema completo. Si una operación sigue incumpliendo el presupuesto acordado, aislarla detrás de una interfaz y comparar una implementación Rust con la de TypeScript.

Las tablas de gestión de proyectos, actividad y habilidades requieren evaluación de dominio antes de incorporarse a la base dedicada al análisis. La migración no debe borrar ni reinterpretar datos existentes sin una comprobación de compatibilidad.
