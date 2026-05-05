import type { DependencyGraph, GraphNode } from '../types';

export function formatMermaid(graph: DependencyGraph): string {
	const lines: string[] = ['graph LR'];

	const cycleEdges = new Set(
		graph.cycles.flatMap((cycle) =>
			cycle.map((name, i) => `${name}-->${cycle[(i + 1) % cycle.length]}`)
		)
	);

	// Node definitions with labels
	for (const node of graph.nodes) {
		lines.push(`  ${nodeId(node.name)}${nodeShape(node)}`);
	}

	lines.push('');

	// Edges
	for (const edge of graph.edges) {
		const isCycle = cycleEdges.has(`${edge.from}-->${edge.to}`);
		const fromNode = graph.nodes.find((n) => n.name === edge.from);
		let arrow: string;
		if (isCycle) {
			arrow = '-. cycle .->';
		} else if (fromNode?.type === 'alias') {
			arrow = '-. alias .-> ';
		} else {
			arrow = '-->';
		}
		lines.push(`  ${nodeId(edge.from)} ${arrow} ${nodeId(edge.to)}`);
	}

	// Class definitions
	lines.push('');
	lines.push('  classDef classNode    fill:#a8d8a8,stroke:#4a8a4a,color:#000');
	lines.push('  classDef funcNode     fill:#a8c4e8,stroke:#2a6090,color:#000');
	lines.push('  classDef valueNode    fill:#f8d878,stroke:#a07820,color:#000');
	lines.push('  classDef aliasNode    fill:#d8b4fe,stroke:#7c3aed,color:#000');
	lines.push(
		'  classDef missingNode  fill:#f0a0a0,stroke:#c02020,color:#000,stroke-dasharray:5 5'
	);

	// Assign classes
	const byClass: Record<string, string[]> = {
		classNode: [],
		funcNode: [],
		valueNode: [],
		aliasNode: [],
		missingNode: [],
	};

	for (const node of graph.nodes) {
		const cls = nodeClass(node);
		byClass[cls].push(nodeId(node.name));
	}

	for (const [cls, ids] of Object.entries(byClass)) {
		if (ids.length > 0) {
			lines.push(`  class ${ids.join(',')} ${cls}`);
		}
	}

	if (graph.cycles.length > 0) {
		lines.push('');
		for (const cycle of graph.cycles) {
			lines.push(`  %% Cycle: ${cycle.join(' → ')}`);
		}
	}

	return lines.join('\n');
}

// Mermaid node IDs cannot contain hyphens or dots — sanitise to underscores
function nodeId(name: string): string {
	return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function nodeShape(node: GraphNode): string {
	const typeLine = node.lifetime
		? `${node.type} · ${node.lifetime}`
		: node.type;
	const label = `${node.name}<br/>(${typeLine})`;
	switch (node.type) {
		case 'class':
			return `["${label}"]`;
		case 'function':
			return `("${label}")`;
		case 'value':
			return `{{"${label}"}}`;
		case 'alias':
			return `[/"${label}"/]`; // parallelogram — visually signals "pass-through"
		default:
			return `["${label}"]`; // missing / unknown
	}
}

function nodeClass(node: GraphNode): string {
	if (node.missing) return 'missingNode';
	switch (node.type) {
		case 'class':
			return 'classNode';
		case 'function':
			return 'funcNode';
		case 'value':
			return 'valueNode';
		case 'alias':
			return 'aliasNode';
		default:
			return 'missingNode';
	}
}
