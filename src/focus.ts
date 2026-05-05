import type { DependencyGraph } from './types';

/**
 * Return the subgraph reachable from `focusName` in both directions:
 * downstream (dependencies of the focus node) and upstream (nodes that
 * depend on the focus node).
 *
 * @param graph   Full dependency graph produced by buildGraph()
 * @param name    Name of the registration to centre the view on
 * @param depth   Max traversal distance in each direction (undefined = unlimited)
 */
export function focusSubgraph(
	graph: DependencyGraph,
	name: string,
	depth?: number
): DependencyGraph {
	if (!graph.nodes.some((n) => n.name === name)) {
		throw new Error(
			`"${name}" is not registered in this container. ` +
				`Available names: ${graph.nodes.map((n) => n.name).join(', ')}`
		);
	}

	// Build forward and reverse adjacency from the edge list.
	// Using edges (not node.dependencies) keeps missing-node handling consistent.
	const forward = new Map<string, string[]>();
	const reverse = new Map<string, string[]>();
	for (const node of graph.nodes) {
		forward.set(node.name, []);
		reverse.set(node.name, []);
	}
	for (const edge of graph.edges) {
		forward.get(edge.from)?.push(edge.to);
		reverse.get(edge.to)?.push(edge.from);
	}

	// BFS outward from the focus node in both directions simultaneously.
	const included = new Set<string>();
	const queue: Array<{ name: string; dist: number }> = [{ name, dist: 0 }];

	while (queue.length > 0) {
		// biome-ignore lint/style/noNonNullAssertion: queue is non-empty by loop condition
		const item = queue.shift()!;
		if (included.has(item.name)) continue;
		included.add(item.name);

		if (depth !== undefined && item.dist >= depth) continue;

		const next = item.dist + 1;
		for (const dep of forward.get(item.name) ?? []) {
			if (!included.has(dep)) queue.push({ name: dep, dist: next });
		}
		for (const dep of reverse.get(item.name) ?? []) {
			if (!included.has(dep)) queue.push({ name: dep, dist: next });
		}
	}

	const nodes = graph.nodes.filter((n) => included.has(n.name));
	const edges = graph.edges.filter(
		(e) => included.has(e.from) && included.has(e.to)
	);
	// Only keep cycles that are fully contained within the subgraph
	const cycles = graph.cycles.filter((cycle) =>
		cycle.every((n) => included.has(n))
	);

	return { nodes, edges, cycles };
}

/**
 * Trim the graph to nodes reachable within `maxDepth` hops from any root
 * (a root is a node with no incoming edges — i.e. nothing depends on it).
 *
 * If the graph has no roots (fully cyclic), the full graph is returned unchanged.
 */
export function limitDepth(
	graph: DependencyGraph,
	maxDepth: number
): DependencyGraph {
	const forward = new Map<string, string[]>();
	const hasIncoming = new Set<string>();
	for (const node of graph.nodes) forward.set(node.name, []);
	for (const edge of graph.edges) {
		forward.get(edge.from)?.push(edge.to);
		hasIncoming.add(edge.to);
	}

	const roots = graph.nodes.filter((n) => !hasIncoming.has(n.name));
	if (roots.length === 0) return graph;

	const included = new Set<string>();
	const queue: Array<{ name: string; dist: number }> = roots.map((n) => ({
		name: n.name,
		dist: 0,
	}));

	while (queue.length > 0) {
		// biome-ignore lint/style/noNonNullAssertion: queue is non-empty by loop condition
		const item = queue.shift()!;
		if (included.has(item.name)) continue;
		included.add(item.name);

		if (item.dist >= maxDepth) continue;

		for (const dep of forward.get(item.name) ?? []) {
			if (!included.has(dep)) queue.push({ name: dep, dist: item.dist + 1 });
		}
	}

	const nodes = graph.nodes.filter((n) => included.has(n.name));
	const edges = graph.edges.filter(
		(e) => included.has(e.from) && included.has(e.to)
	);
	const cycles = graph.cycles.filter((cycle) =>
		cycle.every((n) => included.has(n))
	);
	return { nodes, edges, cycles };
}
