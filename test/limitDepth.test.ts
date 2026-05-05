import { describe, expect, it } from 'vitest';
import { limitDepth } from '../src/focus';
import type { DependencyGraph, GraphNode } from '../src/types';

function node(name: string, deps: string[] = [], type: GraphNode['type'] = 'class'): GraphNode {
	return { name, type, dependencies: deps, missing: false };
}

/**
 * Linear chain:  app → service → repo → database
 *
 * Depths from roots (app is the only root — nothing depends on it):
 *   depth 0 : app
 *   depth 1 : service
 *   depth 2 : repo
 *   depth 3 : database
 */
function makeChain(): DependencyGraph {
	const nodes: GraphNode[] = [
		node('app', ['service']),
		node('service', ['repo']),
		node('repo', ['database']),
		node('database', []),
	];
	const edges = nodes.flatMap((n) => n.dependencies.map((d) => ({ from: n.name, to: d })));
	return { nodes, edges, cycles: [] };
}

/**
 * Diamond:
 *
 *   app
 *   ├─► left  ─► shared
 *   └─► right ─► shared
 */
function makeDiamond(): DependencyGraph {
	const nodes: GraphNode[] = [
		node('app', ['left', 'right']),
		node('left', ['shared']),
		node('right', ['shared']),
		node('shared', []),
	];
	const edges = nodes.flatMap((n) => n.dependencies.map((d) => ({ from: n.name, to: d })));
	return { nodes, edges, cycles: [] };
}

/** Fully cyclic: a → b → a  (no roots) */
function makeCycle(): DependencyGraph {
	return {
		nodes: [node('a', ['b']), node('b', ['a'])],
		edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
		cycles: [['a', 'b']],
	};
}

// ─── basic depth limiting ────────────────────────────────────────────────────

describe('limitDepth — chain', () => {
	it('depth=0 keeps only root nodes', () => {
		const result = limitDepth(makeChain(), 0);
		expect(result.nodes.map((n) => n.name)).toEqual(['app']);
		expect(result.edges).toHaveLength(0);
	});

	it('depth=1 keeps root and its direct dependencies', () => {
		const result = limitDepth(makeChain(), 1);
		const names = result.nodes.map((n) => n.name);
		expect(names).toContain('app');
		expect(names).toContain('service');
		expect(names).not.toContain('repo');
		expect(names).not.toContain('database');
	});

	it('depth=2 keeps two hops from root', () => {
		const result = limitDepth(makeChain(), 2);
		const names = result.nodes.map((n) => n.name);
		expect(names).toContain('repo');
		expect(names).not.toContain('database');
	});

	it('depth ≥ chain length keeps everything', () => {
		const full = makeChain();
		const result = limitDepth(full, 99);
		expect(result.nodes).toHaveLength(full.nodes.length);
	});

	it('only keeps edges whose both endpoints are included', () => {
		const result = limitDepth(makeChain(), 1);
		for (const edge of result.edges) {
			const names = result.nodes.map((n) => n.name);
			expect(names).toContain(edge.from);
			expect(names).toContain(edge.to);
		}
	});
});

// ─── diamond (shared node reachable via two paths) ───────────────────────────

describe('limitDepth — diamond', () => {
	it('depth=1 includes both branches but not shared', () => {
		const result = limitDepth(makeDiamond(), 1);
		const names = result.nodes.map((n) => n.name);
		expect(names).toContain('left');
		expect(names).toContain('right');
		expect(names).not.toContain('shared');
	});

	it('depth=2 includes shared (reachable via two paths at dist 2)', () => {
		const result = limitDepth(makeDiamond(), 2);
		const names = result.nodes.map((n) => n.name);
		expect(names).toContain('shared');
	});
});

// ─── fully cyclic graph (no roots) ──────────────────────────────────────────

describe('limitDepth — no roots fallback', () => {
	it('returns the full graph unchanged when there are no root nodes', () => {
		const cycle = makeCycle();
		const result = limitDepth(cycle, 1);
		expect(result.nodes).toHaveLength(cycle.nodes.length);
		expect(result.edges).toHaveLength(cycle.edges.length);
	});
});

// ─── cycle retention ─────────────────────────────────────────────────────────

describe('limitDepth — cycles', () => {
	it('retains cycles fully within the included subgraph', () => {
		const graph: DependencyGraph = {
			nodes: [node('app', ['a']), node('a', ['b']), node('b', ['a'])],
			edges: [{ from: 'app', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
			cycles: [['a', 'b']],
		};
		const result = limitDepth(graph, 3);
		expect(result.cycles).toEqual([['a', 'b']]);
	});

	it('drops cycles whose members are cut off by depth', () => {
		const graph: DependencyGraph = {
			nodes: [node('app', ['a']), node('a', ['b']), node('b', ['a'])],
			edges: [{ from: 'app', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
			cycles: [['a', 'b']],
		};
		// depth=1: only app + a included, b excluded → cycle dropped
		const result = limitDepth(graph, 1);
		expect(result.cycles).toEqual([]);
	});
});
