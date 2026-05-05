import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph';
import type { GraphNode } from '../src/types';

function node(name: string, deps: string[] = [], type: GraphNode['type'] = 'class'): GraphNode {
	return { name, type, dependencies: deps, missing: false };
}

describe('buildGraph', () => {
	describe('missing nodes', () => {
		it('marks an unregistered dependency as missing', () => {
			const graph = buildGraph([node('a', ['b'])]);
			const missing = graph.nodes.find((n) => n.name === 'b');
			expect(missing?.missing).toBe(true);
			expect(missing?.type).toBe('unknown');
		});

		it('does not create a missing node when dep is registered', () => {
			const graph = buildGraph([node('a', ['b']), node('b')]);
			expect(graph.nodes.filter((n) => n.missing)).toHaveLength(0);
		});

		it('deduplicates missing nodes that are referenced multiple times', () => {
			const graph = buildGraph([node('a', ['x']), node('b', ['x'])]);
			const missing = graph.nodes.filter((n) => n.missing);
			expect(missing).toHaveLength(1);
			expect(missing[0].name).toBe('x');
		});
	});

	describe('edges', () => {
		it('creates an edge per dependency', () => {
			const graph = buildGraph([node('a', ['b', 'c']), node('b'), node('c')]);
			expect(graph.edges).toContainEqual({ from: 'a', to: 'b' });
			expect(graph.edges).toContainEqual({ from: 'a', to: 'c' });
		});

		it('creates no edges for nodes with no dependencies', () => {
			const graph = buildGraph([node('a'), node('b')]);
			expect(graph.edges).toHaveLength(0);
		});

		it('creates edges to missing nodes too', () => {
			const graph = buildGraph([node('a', ['ghost'])]);
			expect(graph.edges).toContainEqual({ from: 'a', to: 'ghost' });
		});
	});

	describe('cycle detection', () => {
		it('returns empty cycles for a tree', () => {
			const graph = buildGraph([node('a', ['b']), node('b', ['c']), node('c')]);
			expect(graph.cycles).toEqual([]);
		});

		it('detects a direct two-node cycle', () => {
			const graph = buildGraph([node('a', ['b']), node('b', ['a'])]);
			expect(graph.cycles.length).toBeGreaterThan(0);
			const flat = graph.cycles.flat();
			expect(flat).toContain('a');
			expect(flat).toContain('b');
		});

		it('detects a three-node cycle', () => {
			const graph = buildGraph([node('a', ['b']), node('b', ['c']), node('c', ['a'])]);
			expect(graph.cycles.length).toBeGreaterThan(0);
		});

		it('does not flag missing deps as cycles', () => {
			// 'ghost' is unregistered — should not create a phantom cycle
			const graph = buildGraph([node('a', ['ghost'])]);
			expect(graph.cycles).toEqual([]);
		});
	});

	describe('alias nodes', () => {
		it('alias deps create edges to the target', () => {
			const graph = buildGraph([
				node('logger', [], 'class'),
				node('log', ['logger'], 'alias'),
			]);
			expect(graph.edges).toContainEqual({ from: 'log', to: 'logger' });
		});

		it('alias target is not marked missing when registered', () => {
			const graph = buildGraph([
				node('logger', [], 'class'),
				node('log', ['logger'], 'alias'),
			]);
			expect(graph.nodes.find((n) => n.name === 'logger')?.missing).toBe(false);
		});
	});
});
