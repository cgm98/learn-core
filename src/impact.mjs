/**
 * Read-only impact analysis over the existing code_files/code_symbols/code_edges schema.
 * An edge A -> B means A depends on B; changed B can affect A.
 */
export function analyzeImpact(store, { domainId, focusId, maxDepth = 3, maxNodes = 100 }) {
  if (!domainId || !focusId) throw new Error('domainId y focusId son obligatorios');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 10) throw new Error('maxDepth debe estar entre 0 y 10');
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 10000) throw new Error('maxNodes debe estar entre 1 y 10000');

  const focus = store.getNode(domainId, focusId);
  if (!focus) return { status: 'not_indexed', domainId, focusId, affected: [], limitations: ['El nodo no figura en el índice. No se puede inferir ausencia de impacto.'] };

  const seen = new Set([focusId]);
  const queue = [{ id: focusId, depth: 0, path: [] }];
  const affected = [];
  const limitations = new Set();
  let truncated = false;

  if (focus.nodeType === 'file' && store.getDefinedSymbols) {
    const definitions = store.getDefinedSymbols(domainId, focusId, maxNodes - 1);
    for (const node of definitions.nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const path = [{ type: 'DEFINES', from: focusId, to: node.id, evidence: 'static_edge' }];
      affected.push({ node, depth: 0, path });
      queue.push({ id: node.id, depth: 0, path });
    }
    if (definitions.truncated) {
      truncated = true;
      limitations.add('Se alcanzó maxNodes al enumerar los símbolos del archivo.');
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const item = queue[head];
    const dependents = store.getDependents(domainId, item.id);
    if (item.depth >= maxDepth) {
      if (dependents.length > 0) { truncated = true; limitations.add('Se alcanzó maxDepth; pueden existir dependientes adicionales.'); }
      continue;
    }
    for (const edge of dependents) {
      if (seen.has(edge.from)) continue;
      if (seen.size >= maxNodes) { truncated = true; limitations.add('Se alcanzó maxNodes; pueden existir dependientes adicionales.'); break; }
      const node = store.getNode(domainId, edge.from);
      if (!node) { limitations.add(`Arista ${edge.type} hacia un nodo no indexado: ${edge.from}`); continue; }
      seen.add(edge.from);
      const path = [...item.path, {
        type: edge.type, from: edge.from, to: edge.to, evidence: edge.evidence ?? 'static_edge',
        ...(edge.callLine ? { sourcePath: edge.sourcePath, line: edge.callLine, column: edge.callColumn } : {})
      }];
      affected.push({ node, depth: item.depth + 1, path });
      queue.push({ id: edge.from, depth: item.depth + 1, path });
    }
  }

  limitations.add('Las aristas expresan posibles dependencias, no prueban una regresión.');
  limitations.add('La frescura del índice y las dependencias dinámicas no están verificadas por esta consulta.');
  return { status: 'analyzed', domainId, focus, affected, truncated, limitations: [...limitations] };
}
