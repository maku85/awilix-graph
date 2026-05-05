import type { DependencyGraph, GraphNode } from '../types';

const COLORS: Record<string, string> = {
	class: '#a8d8a8', // green
	function: '#a8c4e8', // blue
	value: '#f8d878', // yellow
	alias: '#d8b4fe', // lavender
	unknown: '#f0a0a0', // red (missing)
};

const SHAPES: Record<string, string> = {
	class: 'box',
	function: 'ellipse',
	value: 'diamond',
	alias: 'box',
	unknown: 'box',
};

export function formatDot(graph: DependencyGraph): string {
	const lines: string[] = [
		'digraph AwilixDependencies {',
		'  rankdir=LR;',
		'  node [fontname="Helvetica", fontsize=11];',
		'  edge [color="#666666"];',
		'',
	];

	const cycleEdges = new Set(
		graph.cycles.flatMap((cycle) =>
			cycle.map((name, i) => `${name}->${cycle[(i + 1) % cycle.length]}`)
		)
	);

	for (const node of graph.nodes) {
		lines.push(nodeStatement(node));
	}

	lines.push('');

	for (const edge of graph.edges) {
		const key = `${edge.from}->${edge.to}`;
		const isCycle = cycleEdges.has(key);
		const fromNode = graph.nodes.find((n) => n.name === edge.from);
		let attrs: string;
		if (isCycle) {
			attrs = ' [color="#d44", style=dashed, label="cycle"]';
		} else if (fromNode?.type === 'alias') {
			attrs = ' [style=dashed, arrowhead=open, label="alias"]';
		} else {
			attrs = '';
		}
		lines.push(`  ${q(edge.from)} -> ${q(edge.to)}${attrs};`);
	}

	if (graph.cycles.length > 0) {
		lines.push('');
		lines.push(
			`  // Cycles detected: ${graph.cycles.map((c) => c.join(' → ')).join('; ')}`
		);
	}

	lines.push('}');
	return lines.join('\n');
}

function nodeStatement(node: GraphNode): string {
	const color = COLORS[node.type] ?? COLORS.unknown;
	const shape = SHAPES[node.type] ?? 'box';
	const lifetimeSuffix = node.lifetime ? `\\n[${node.lifetime}]` : '';
	const label = `${node.name}\\n(${node.type})${lifetimeSuffix}`;
	const style = node.missing ? 'filled,dashed' : 'filled';
	// SINGLETON → double outline (peripheries=2); SCOPED → bold border (penwidth=2)
	const extra =
		node.lifetime === 'SINGLETON'
			? ', peripheries=2'
			: node.lifetime === 'SCOPED'
				? ', penwidth=2'
				: '';
	return `  ${q(node.name)} [label="${label}", shape=${shape}, style="${style}", fillcolor="${color}"${extra}];`;
}

function q(name: string): string {
	return `"${name.replace(/"/g, '\\"')}"`;
}
