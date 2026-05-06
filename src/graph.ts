import type { DependencyGraph, GraphEdge, GraphNode } from './types';
import { detectViolations } from './violations';

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

	const violations = detectViolations(allNodes, edges);
	return { nodes: allNodes, edges, cycles, violations };
}

// Iterative DFS cycle detection — avoids call-stack overflow on deep dependency chains.
function detectCycles(nodes: GraphNode[]): string[][] {
	const adjacency = new Map<string, string[]>(
		nodes.map((n) => [n.name, n.dependencies])
	);
	const visited = new Set<string>();
	const cycles: string[][] = [];

	type Frame = { name: string; children: string[]; childIdx: number };

	for (const startNode of nodes) {
		if (visited.has(startNode.name)) continue;

		// path / pathSet / pathIndex track the current DFS path for back-edge detection.
		const path: string[] = [];
		const pathSet = new Set<string>();
		const pathIndex = new Map<string, number>();
		const stack: Frame[] = [];

		const pushNode = (name: string) => {
			visited.add(name);
			pathIndex.set(name, path.length);
			path.push(name);
			pathSet.add(name);
			stack.push({ name, children: adjacency.get(name) ?? [], childIdx: 0 });
		};

		pushNode(startNode.name);

		while (stack.length > 0) {
			const frame = stack[stack.length - 1];

			if (frame.childIdx >= frame.children.length) {
				// All children processed — backtrack
				stack.pop();
				pathSet.delete(frame.name);
				pathIndex.delete(frame.name);
				path.pop();
				continue;
			}

			const dep = frame.children[frame.childIdx++];
			if (!adjacency.has(dep)) continue; // skip missing nodes

			if (!visited.has(dep)) {
				pushNode(dep);
			} else if (pathSet.has(dep)) {
				// Back edge — record the cycle
				const startIdx = pathIndex.get(dep);
				if (startIdx !== undefined) {
					cycles.push(path.slice(startIdx));
				}
			}
		}
	}

	return cycles;
}
