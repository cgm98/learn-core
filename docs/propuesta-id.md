# Propuesta de investigación y desarrollo: LEARN-CORE

## Problema y usuario inicial

Los agentes de desarrollo deben decidir qué partes de un repositorio inspeccionar y qué verificaciones ejecutar después de modificar código. La búsqueda textual y los archivos completos pueden omitir dependencias relevantes o gastar contexto en fragmentos irrelevantes. El usuario inicial es un agente que modifica servicios TypeScript en un repositorio con pruebas y resultados de CI accesibles.

LEARN-CORE responderá a una consulta sobre un *diff* con: (1) posibles dependencias afectadas, (2) pruebas candidatas, (3) una ruta verificable desde el cambio hasta cada recomendación y (4) zonas que el analizador no puede resolver. La salida debe distinguir hechos comprobados por análisis estático, relaciones observadas en pruebas y señales estadísticas del historial.

## Hipótesis falsable

En tareas de modificación de proyectos TypeScript, un contexto seleccionado mediante dependencias semánticas y cobertura observada reducirá los tokens y el coste de verificación frente a búsquedas textual y por símbolos, **sin empeorar la resolución de tareas ni aumentar las regresiones**. El historial de co-cambios es una hipótesis adicional; solo se incluirá en el producto si aporta una mejora incremental demostrable.

## Alcance técnico de la primera versión

1. **Cambios como entrada.** Se compararán dos revisiones Git. Las entidades modificadas se identificarán por archivo, símbolo y rango de líneas; cada respuesta llevará el identificador de la revisión analizada.
2. **Grafo semántico para TypeScript.** El compilador de TypeScript aportará resolución de símbolos y tipos. El grafo inicial contendrá imports, referencias y llamadas resueltas, con aristas que conserven ubicación y procedencia. El análisis de efectos, alias y llamadas dinámicas se añadirá por casos medidos; no se afirmará que el grafo inicial es un SDG completo.
3. **Análisis de impacto.** Un recorrido hacia delante producirá candidatos afectados; un recorrido hacia atrás explicará las dependencias de cada candidato. Las rutas se limitarán por presupuesto de tiempo y tamaño, y la respuesta registrará truncamientos y aristas desconocidas.
4. **Pruebas y evidencia.** Cuando exista cobertura por prueba, se cruzará con los símbolos afectados. Una dependencia estática o un co-cambio histórico no se presentarán como prueba de que una regresión ocurrirá.
5. **Co-cambios temporales.** Se conservarán como aristas estadísticas con ventana temporal, peso y número de observaciones. Se compararán con una variante sin historial antes de usarlos en recomendaciones.
6. **Entrega a agentes.** Una interfaz MCP expondrá operaciones de consulta y diagnóstico con salidas estructuradas y citas de código. El número y la forma de las herramientas se decidirán midiendo facilidad de uso y tasa de éxito del agente.

## Decisiones de tecnología

| Componente | Primera elección | Motivo y condición de revisión |
| --- | --- | --- |
| Análisis TypeScript | API del compilador TypeScript | Permite resolver símbolos y tipos; Tree-Sitter se podrá usar para otros lenguajes, pero su árbol sintáctico por sí solo no ofrece esas relaciones. |
| Orquestación y MCP | Node.js y TypeScript | Facilita integrar los servicios existentes y medir un sistema funcional antes de reescribirlo. |
| Persistencia local | SQLite en modo WAL | Adecuado para un índice local versionado; el tamaño se medirá por repositorio, sin límite universal previo. |
| Grafo | Modelo de nodos y aristas con procedencia, persistido en SQLite | Permite reconstruir resultados y evaluar actualización incremental. Una representación en memoria se añadirá si el perfil de consultas lo exige. |
| Motor nativo | Rust solo tras perfilado | Se aislará una operación costosa con una interfaz estable y se comparará extremo a extremo, incluidos bindings y serialización. |

La modernización de FoxPro/.NET es una posible aplicación posterior con evaluación propia. La extracción automática de lógica y su equivalencia funcional no forman parte de la promesa inicial.

## Protocolo experimental

### Datos

- Repositorios TypeScript con historial, pruebas reproducibles y permisos de uso claros.
- Separación temporal: cada predicción usa solo el estado y el historial disponibles antes del cambio evaluado.
- Cambios etiquetados por pruebas que detectaron fallos, revisiones posteriores o análisis manual. Cada etiqueta tendrá procedencia; ausencia de fallo observado no se tratará automáticamente como prueba de seguridad.
- Un conjunto reservado hasta fijar parámetros y decisiones de diseño.

### Comparaciones

| Variante | Contexto disponible |
| --- | --- |
| B0 | Búsqueda textual y archivos relevantes bajo el mismo presupuesto de tokens |
| B1 | Recuperación por símbolos y dependencias directas |
| A1 | Grafo semántico y rutas de impacto |
| A2 | A1 más cobertura por prueba |
| A3 | A2 más señales de co-cambio temporal |

El mismo modelo, agente, herramientas de edición, tareas y presupuesto se usarán en todas las variantes. Se repetirán las ejecuciones para estimar variabilidad.

### Métricas y criterios de decisión

1. **Seguridad de la selección:** regresiones detectadas frente a ejecutar todas las pruebas, falsos negativos y casos sin evidencia suficiente. Un falso negativo se revisará individualmente.
2. **Utilidad para el agente:** tareas resueltas, cambios aceptados, regresiones introducidas y coste total por tarea. Reducir tokens sin mantener el resultado no constituye éxito.
3. **Rendimiento:** latencia de índice completo y actualización incremental, p50/p95 de consultas, memoria máxima y tamaño de base de datos. Cada medición indicará hardware, repositorio, caché y operación exacta.
4. **Ablación:** A1 frente a B1, A2 frente a A1 y A3 frente a A2 para identificar qué componente aporta valor.

Se adoptará una característica si mejora una métrica relevante sin degradación material de seguridad o calidad en el conjunto reservado. Los umbrales numéricos se fijarán antes de ejecutar esa evaluación, tras medir una línea de base. No se publicarán metas como si fueran resultados.

## Riesgos técnicos y controles

- **Despacho dinámico, reflexión y código generado:** marcar el alcance desconocido y ampliar verificaciones cuando corresponda.
- **Cobertura incompleta o desactualizada:** asociar cada dato a una revisión y registrar la fecha de observación.
- **Sesgo del historial Git:** excluir commits masivos o generados, estudiar sensibilidad a la ventana temporal y comparar con el modelo sin co-cambios.
- **Explosión del grafo y del contexto:** imponer presupuestos y declarar qué rutas quedaron fuera; no prometer complejidad constante para emitir un slice.
- **Contaminación del benchmark:** congelar conjuntos de datos y separar cambios por fecha y repositorio cuando sea posible.

## Hitos de investigación

1. **Base medible:** instrumentar los servicios existentes, obtener repositorios de evaluación y establecer B0/B1.
2. **Grafo semántico:** crear A1 para TypeScript y validar manualmente rutas de impacto representativas.
3. **Cobertura y verificación:** construir A2 y medir falsos negativos y coste de pruebas.
4. **Historial:** evaluar A3; conservarlo solo si la ablación muestra valor.
5. **Optimización:** perfilar y mover a Rust únicamente las operaciones cuyo coste medido lo justifique.
6. **Caso de agente:** evaluar éxito y regresiones en tareas reales con evidencia reproducible.

El resultado de I+D esperado es un método validado para reducir el coste de comprensión y verificación de cambios. La ventaja técnica dependerá de resultados reproducibles frente a alternativas fuertes, no de la combinación nominal de AST, Git, Rust y MCP.
