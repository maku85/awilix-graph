import type { GraphEdge, GraphNode, Lifetime, LifetimeViolation } from './types';

// Longer lifetime = higher rank. A service can only depend on equal or longer lifetimes.
const RANK: Record<Lifetime, number> = {
	SINGLETON: 3,
	SCOPED: 2,
	TRANSIENT: 1,
};

/**
 * Detect lifetime violations in a dependency graph.
 *
 * Rules:
 *   SINGLETON → SCOPED    error   (captive dependency: singleton captures a scoped instance)
 *   SINGLETON → TRANSIENT error   (captive dependency: singleton captures a single "transient")
 *   SCOPED    → TRANSIENT warning (scoped gets one transient per scope instead of per-call)
 *
 * Nodes without an explicit lifetime are skipped to avoid false positives
 * (the container's default lifetime is not known statically).
 */
export function detectViolations(
	nodes: GraphNode[],
	edges: GraphEdge[]
): LifetimeViolation[] {
	const byName = new Map(nodes.map((n) => [n.name, n]));
	const violations: LifetimeViolation[] = [];

	for (const edge of edges) {
		const from = byName.get(edge.from);
		const to = byName.get(edge.to);
		if (!from?.lifetime || !to?.lifetime) continue;

		const fromRank = RANK[from.lifetime];
		const toRank = RANK[to.lifetime];

		if (fromRank > toRank) {
			violations.push({
				from: edge.from,
				to: edge.to,
				fromLifetime: from.lifetime,
				toLifetime: to.lifetime,
				severity: from.lifetime === 'SINGLETON' ? 'error' : 'warning',
			});
		}
	}

	return violations;
}
