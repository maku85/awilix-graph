import type { DependencyGraph, GraphNode } from '../types';

export function formatMermaid(graph: DependencyGraph): string {
	// Pre-compute collision-free Mermaid node IDs.
	// Two names that differ only in special chars (e.g. "my-svc" vs "my.svc") would both
	// sanitise to "my_svc" — append a numeric suffix to disambiguate.
	const nodeIds = buildNodeIdMap(graph.nodes);
	const nid = (name: string) => nodeIds.get(name) ?? name.replace(/[^a-zA-Z0-9_]/g, '_');

	const lines: string[] = ['graph LR'];

	const cycleEdges = new Set(
		graph.cycles.flatMap((cycle) =>
			cycle.map((name, i) => `${name}-->${cycle[(i + 1) % cycle.length]}`)
		)
	);

	// Node definitions with labels
	for (const node of graph.nodes) {
		lines.push(`  ${nid(node.name)}${nodeShape(node)}`);
	}

	lines.push('');

	// Edges — track index for linkStyle violation highlighting
	const violationKeys = new Map(
		(graph.violations ?? []).map((v) => [`${v.from}\0${v.to}`, v.severity])
	);
	const violationStyles: string[] = [];
	let edgeIdx = 0;

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
		lines.push(`  ${nid(edge.from)} ${arrow} ${nid(edge.to)}`);

		const severity = violationKeys.get(`${edge.from}\0${edge.to}`);
		if (severity) {
			const color = severity === 'error' ? '#e53e3e' : '#ed8936';
			violationStyles.push(`  linkStyle ${edgeIdx} stroke:${color},stroke-width:2.5px`);
		}
		edgeIdx++;
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
		byClass[cls].push(nid(node.name));
	}

	for (const [cls, ids] of Object.entries(byClass)) {
		if (ids.length > 0) {
			lines.push(`  class ${ids.join(',')} ${cls}`);
		}
	}

	if (violationStyles.length > 0) {
		lines.push('');
		lines.push(...violationStyles);
	}

	if (graph.cycles.length > 0) {
		lines.push('');
		for (const cycle of graph.cycles) {
			lines.push(`  %% Cycle: ${cycle.join(' → ')}`);
		}
	}

	return lines.join('\n');
}

// Sanitise a node name to a valid Mermaid ID, then disambiguate collisions
// caused by different names that map to the same sanitised string.
function buildNodeIdMap(nodes: GraphNode[]): Map<string, string> {
	const byBase = new Map<string, string[]>();
	for (const node of nodes) {
		const base = node.name.replace(/[^a-zA-Z0-9_]/g, '_');
		const group = byBase.get(base) ?? [];
		if (!byBase.has(base)) byBase.set(base, group);
		group.push(node.name);
	}
	const result = new Map<string, string>();
	for (const [base, names] of byBase) {
		if (names.length === 1) {
			result.set(names[0], base);
		} else {
			names.forEach((name, i) => result.set(name, `${base}_${i}`));
		}
	}
	return result;
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
