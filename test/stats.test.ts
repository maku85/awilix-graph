import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph';
import { computeStats } from '../src/stats';
import type { GraphNode } from '../src/types';

function node(
	name: string,
	deps: string[] = [],
	type: GraphNode['type'] = 'class',
	lifetime?: GraphNode['lifetime'],
): GraphNode {
	return { name, type, dependencies: deps, missing: false, lifetime };
}

describe('computeStats', () => {
	it('counts nodes, missing nodes, and edges', () => {
		// a → b → c, d is unregistered (missing)
		const graph = buildGraph([node('a', ['b', 'd']), node('b', ['c']), node('c')]);
		const stats = computeStats(graph);
		expect(stats.nodeCount).toBe(3);
		expect(stats.missingCount).toBe(1); // d
		expect(stats.edgeCount).toBe(3); // a→b, a→d, b→c (d is missing but edge still exists)
	});

	it('counts cycles and violations', () => {
		const graph = buildGraph([
			node('a', ['b'], 'class', 'SINGLETON'),
			node('b', ['a'], 'class', 'TRANSIENT'),
		]);
		const stats = computeStats(graph);
		expect(stats.cycleCount).toBe(1);
		expect(stats.violationErrorCount).toBe(1); // SINGLETON → TRANSIENT
	});

	it('computes fan-in and fan-out correctly', () => {
		// logger is used by a, b, c → fan-in 3; logger has no deps → fan-out 0
		const graph = buildGraph([
			node('a', ['logger']),
			node('b', ['logger']),
			node('c', ['logger']),
			node('logger'),
		]);
		const stats = computeStats(graph);
		const loggerStats = stats.nodes.find((n) => n.name === 'logger');
		expect(loggerStats?.fanIn).toBe(3);
		expect(loggerStats?.fanOut).toBe(0);
	});

	it('computes instability = fanOut / (fanIn + fanOut)', () => {
		// a depends on b and c; b and c have no deps and nothing depends on a
		const graph = buildGraph([node('a', ['b', 'c']), node('b'), node('c')]);
		const stats = computeStats(graph);

		const aStats = stats.nodes.find((n) => n.name === 'a');
		expect(aStats?.fanIn).toBe(0);
		expect(aStats?.fanOut).toBe(2);
		expect(aStats?.instability).toBeCloseTo(1.0);

		const bStats = stats.nodes.find((n) => n.name === 'b');
		expect(bStats?.fanIn).toBe(1);
		expect(bStats?.fanOut).toBe(0);
		expect(bStats?.instability).toBeCloseTo(0.0);
	});

	it('sets instability to null for isolated nodes (fan-in = fan-out = 0)', () => {
		const graph = buildGraph([node('isolated')]);
		const stats = computeStats(graph);
		expect(stats.nodes[0].instability).toBeNull();
	});

	it('sorts nodes by fan-in descending, then fan-out descending', () => {
		const graph = buildGraph([
			node('a', ['logger']),
			node('b', ['logger']),
			node('logger'),
			node('leaf', []),
		]);
		const stats = computeStats(graph);
		const names = stats.nodes.map((n) => n.name);
		// logger has fan-in 2; a and b have fan-in 0 (but fan-out 1); leaf has both 0
		expect(names[0]).toBe('logger');
	});

	it('excludes missing nodes from the nodes array', () => {
		const graph = buildGraph([node('a', ['missing'])]);
		const stats = computeStats(graph);
		expect(stats.nodes.every((n) => !n.name.includes('missing') || n.fanIn !== undefined)).toBe(true);
		expect(stats.nodes.find((n) => n.name === 'missing')).toBeUndefined();
	});
});
