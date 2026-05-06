import type { DependencyGraph, GraphNode } from '../types';
import { formatMermaid } from './mermaid';

const LEGEND = [
	{ cls: 'class', color: '#a8d8a8', border: '#4a8a4a', label: 'class' },
	{ cls: 'function', color: '#a8c4e8', border: '#2a6090', label: 'function' },
	{ cls: 'value', color: '#f8d878', border: '#a07820', label: 'value' },
	{ cls: 'alias', color: '#d8b4fe', border: '#7c3aed', label: 'alias' },
	{ cls: 'missing', color: '#f0a0a0', border: '#c02020', label: 'missing' },
];

export function formatHtml(graph: DependencyGraph): string {
	const MAX_MERMAID_SIZE = 48000;
	const BLOCK_SIZE = 40;

	function chunk<T>(arr: T[], size: number): T[][] {
		const res: T[][] = [];
		for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
		return res;
	}

	const nodeToBlock: Record<string, number> = {};
	const diagrams: { src: string; crossLinks: string[] }[] = [];
	let nodeBlocks: GraphNode[][] = [];
	if (graph.nodes.length > BLOCK_SIZE) {
		nodeBlocks = chunk(graph.nodes, BLOCK_SIZE);
	} else {
		nodeBlocks = [graph.nodes];
	}

	nodeBlocks.forEach((block, idx) => {
		for (const n of block) nodeToBlock[n.name] = idx;
	});

	for (let blockIdx = 0; blockIdx < nodeBlocks.length; ++blockIdx) {
		const nodes = nodeBlocks[blockIdx];
		const nodeNames = new Set(nodes.map((n) => n.name));
		const edges = graph.edges.filter(
			(e) => nodeNames.has(e.from) && nodeNames.has(e.to)
		);
		const subgraph: DependencyGraph = {
			nodes,
			edges,
			cycles: [],
		};
		const mermaid = formatMermaid(subgraph);
		if (mermaid.length > MAX_MERMAID_SIZE && nodes.length > 10) {
			for (const subNodes of chunk(nodes, 10)) {
				const subNames = new Set(subNodes.map((n) => n.name));
				const subEdges = edges.filter(
					(e) => subNames.has(e.from) && subNames.has(e.to)
				);
				const subgraph2: DependencyGraph = {
					nodes: subNodes,
					edges: subEdges,
					cycles: [],
				};
				diagrams.push({ src: formatMermaid(subgraph2), crossLinks: [] });
			}
		} else {
			const crossLinks: string[] = [];
			for (const n of nodes) {
				const outgoing = graph.edges.filter(
					(e) => e.from === n.name && !nodeNames.has(e.to)
				);
				for (const e of outgoing) {
					const targetBlock = nodeToBlock[e.to];
					if (targetBlock !== undefined && targetBlock !== blockIdx) {
						crossLinks.push(
							`<li>${n.name} → <a href="#diagram-${targetBlock + 1}">${e.to} (Diagram ${targetBlock + 1})</a></li>`
						);
					}
				}
			}
			diagrams.push({ src: mermaid, crossLinks });
		}
	}

	const nodeCount = graph.nodes.filter((n) => !n.missing).length;
	const missingCount = graph.nodes.filter((n) => n.missing).length;
	const edgeCount = graph.edges.length;
	const cycleCount = graph.cycles.length;

	const statsItems = [
		`${nodeCount} node${nodeCount !== 1 ? 's' : ''}`,
		`${edgeCount} edge${edgeCount !== 1 ? 's' : ''}`,
		missingCount > 0 ? `${missingCount} missing` : null,
		cycleCount > 0 ? `${cycleCount} cycle${cycleCount !== 1 ? 's' : ''}` : null,
	]
		.filter(Boolean)
		.join(' · ');

	const legendHtml = LEGEND.map(
		(e) =>
			`<span class="legend-item"><span class="legend-swatch" style="background:${e.color};border-color:${e.border}"></span>${e.label}</span>`
	).join('');

	const cyclesHtml =
		cycleCount > 0
			? `<section class="cycles">
    <h2>⚠ Cycles (${cycleCount})</h2>
    <ul>${graph.cycles.map((c) => `<li>${c.join(' → ')} → ${c[0]}</li>`).join('')}</ul>
  </section>`
			: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>awilix-graph</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'default', flowchart: { useMaxWidth: false } });
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6; color: #111; min-height: 100vh; display: flex; flex-direction: column; }
    header { background: #1e1b4b; color: #fff; padding: 1rem 2rem; display: flex; align-items: baseline; gap: 1.5rem; flex-wrap: wrap; }
    header h1 { font-size: 1.1rem; font-weight: 700; letter-spacing: 0.02em; }
    .stats { font-size: 0.8rem; color: #a5b4fc; }
    main { flex: 1; padding: 2rem; display: flex; flex-direction: column; gap: 2rem; align-items: center; }
    .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.08); padding: 2rem; max-width: 100%; overflow: auto; margin-bottom: 2rem; }
    .crosslinks { font-size: 0.85em; color: #444; margin-bottom: 0.7em; }
    .crosslinks ul { margin-left: 1.2em; }
    .cycles { margin: 0 2rem 2rem; background: #fff7ed; border: 1px solid #f97316; border-radius: 8px; padding: 1rem 1.5rem; }
    .cycles h2 { font-size: 0.9rem; color: #c2410c; margin-bottom: 0.5rem; }
    .cycles ul { padding-left: 1.2rem; font-size: 0.85rem; color: #7c2d12; }
    .cycles li { margin-bottom: 0.25rem; font-family: monospace; }
    footer { background: #1e1b4b; padding: 0.75rem 2rem; display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
    .legend-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #c7d2fe; }
    .legend-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid; }
  </style>
</head>
<body>
  <header>
    <h1>awilix-graph</h1>
    <span class="stats">${statsItems}</span>
  </header>
  <main>
    ${diagrams
			.map(
				(d, i) => `
      <div class="card" id="diagram-${i + 1}">
        <div style="font-size:0.8em;color:#888;margin-bottom:0.5em;">Diagram ${i + 1} / ${diagrams.length}</div>
        ${d.crossLinks.length > 0 ? `<div class="crosslinks"><b>Collegamenti ad altri diagrammi:</b><ul>${d.crossLinks.join('')}</ul></div>` : ''}
        <pre class="mermaid">${d.src}</pre>
      </div>
    `
			)
			.join('')}
  </main>
  ${cyclesHtml}
  <footer>${legendHtml}</footer>
</body>
</html>`;
}
