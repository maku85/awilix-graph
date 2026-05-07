import type { DependencyGraph, GraphStats, NodeStats } from './types';

export function computeStats(graph: DependencyGraph): GraphStats {
	const { nodes, edges, cycles, violations = [] } = graph;

	const fanIn = new Map<string, number>();
	const fanOut = new Map<string, number>();
	for (const node of nodes) {
		fanIn.set(node.name, 0);
		fanOut.set(node.name, 0);
	}
	for (const edge of edges) {
		fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1);
		fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
	}

	const nodeStats: NodeStats[] = nodes
		.filter((n) => !n.missing)
		.map((node) => {
			const fi = fanIn.get(node.name) ?? 0;
			const fo = fanOut.get(node.name) ?? 0;
			const instability = fi + fo === 0 ? null : fo / (fi + fo);
			return {
				name: node.name,
				type: node.type,
				lifetime: node.lifetime,
				fanIn: fi,
				fanOut: fo,
				instability,
			};
		})
		.sort(
			(a, b) =>
				b.fanIn - a.fanIn || b.fanOut - a.fanOut || a.name.localeCompare(b.name)
		);

	return {
		nodeCount: nodes.filter((n) => !n.missing).length,
		missingCount: nodes.filter((n) => n.missing).length,
		edgeCount: edges.length,
		cycleCount: cycles.length,
		violationErrorCount: violations.filter((v) => v.severity === 'error')
			.length,
		violationWarningCount: violations.filter((v) => v.severity === 'warning')
			.length,
		nodes: nodeStats,
	};
}
