# Auditoría inicial de llamadas TypeScript — 2026-10-23

Se ejecutó `semantic:audit` sobre el `tsconfig.json` de `App/LEARN/server`, utilizando las 7.381 filas `code_symbols` del dominio `learn` en `L_GROUP/learn-core/db/learn_code.db`. La base se abrió con `immutable=1` porque el entorno de trabajo no pudo abrirla en modo SQLite normal de solo lectura. La auditoría **no escribió** en esa base; cambios pendientes en WAL podrían no estar incluidos.

| Medida | Resultado |
| --- | ---: |
| Archivos fuente analizados | 520 |
| Llamadas enlazadas a dos símbolos indexados | 974 |
| Llamadas sin enlace completo | 12.726 |
| Sin símbolo de origen indexado | 876 |
| Sin símbolo de destino indexado | 6.059 |
| Sin ninguno de los dos | 5.791 |
| Tiempo de la pasada | ~3,9 s en este equipo |

El total de llamadas incluye bibliotecas externas, funciones nativas, callbacks anónimos, código no cubierto por el índice heredado y casos dinámicos. Por ello, `974 / 13.700` **no es una tasa de precisión ni de cobertura del producto**. Es una medida diagnóstica para priorizar el emparejamiento con símbolos internos. Antes de recomendar esta capa a un agente, se necesita una muestra etiquetada manualmente de llamadas internas y medir precisión y exhaustividad sobre ella.

La pasada offline conserva solo enlaces inequívocos y deja intactas las aristas `CALLS` previas. Conviene evaluar por separado su ganancia frente al índice heredado y después decidir si se integra con el watcher.

## Bootstrap independiente

Se ejecutó `bootstrap:ts` sobre el mismo `tsconfig` en una base temporal nueva: 520 archivos, 1.017 símbolos (funciones, clases y métodos del alcance inicial), 1.090 imports y 974 llamadas resueltas. La ejecución completa tardó unos 17 segundos en este equipo. Una consulta de impacto sobre `generateId` devolvió 19 dependientes con procedencia `typescript_compiler`. Esta prueba confirma el flujo de extremo a extremo en el servidor LEARN, pero todavía no mide precisión frente a etiquetas humanas ni rendimiento p95 en varios repositorios.
