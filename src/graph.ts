import type { DependencyGraph, GraphEdge, GraphNode } from './types';

export function buildGraph(nodes: GraphNode[]): DependencyGraph {
	const registered = new Set(nodes.map((n) => n.name));

	// Collect dependencies that reference unregistered names
	const missingNames = new Set<string>();
	for (const node of nodes) {
		for (const dep of node.dependencies) {
			if (!registered.has(dep)) missingNames.add(dep);
		}
	}

	const missingNodes: GraphNode[] = Array.from(missingNames).map((name) => ({
		name,
		type: 'unknown',
		dependencies: [],
		missing: true,
	}));

	const allNodes = [...nodes, ...missingNodes];

	const edges: GraphEdge[] = nodes.flatMap((node) =>
		node.dependencies.map((dep) => ({ from: node.name, to: dep }))
	);

	const cycles = detectCycles(nodes);

	return { nodes: allNodes, edges, cycles };
}

// DFS-based cycle detection — returns each cycle as an ordered list of node names.
function detectCycles(nodes: GraphNode[]): string[][] {
	const adjacency = new Map<string, string[]>(
		nodes.map((n) => [n.name, n.dependencies])
	);
	const visited = new Set<string>();
	const inStack = new Set<string>();
	const cycles: string[][] = [];

	function dfs(name: string, path: string[]): void {
		visited.add(name);
		inStack.add(name);

		for (const dep of adjacency.get(name) ?? []) {
			if (!adjacency.has(dep)) continue; // skip missing nodes

			if (!visited.has(dep)) {
				dfs(dep, [...path, dep]);
			} else if (inStack.has(dep)) {
				const startIdx = path.indexOf(dep);
				if (startIdx !== -1) {
					cycles.push(path.slice(startIdx));
				}
			}
		}

		inStack.delete(name);
	}

	for (const node of nodes) {
		if (!visited.has(node.name)) {
			dfs(node.name, [node.name]);
		}
	}

	return cycles;
}
