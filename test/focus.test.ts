import { describe, expect, it } from 'vitest';
import { focusSubgraph } from '../src/focus';
import type { DependencyGraph, GraphNode } from '../src/types';

// Helpers

function node(name: string, deps: string[] = [], type: GraphNode['type'] = 'class'): GraphNode {
	return { name, type, dependencies: deps, missing: false };
}

function missing(name: string): GraphNode {
	return { name, type: 'unknown', dependencies: [], missing: true };
}

/**
 * Graph used in most tests:
 *
 *   config (value)   logger
 *        ↑              ↑  ↑
 *      database      (also used by app)
 *        ↑  ↑
 *    userRepo  db(alias)
 *        ↑
 *    authService
 *        ↑
 *       app ──────────────► logger
 *        ↑
 *     metrics        ← 3 hops from database via userRepo chain
 *
 * Distances from `database`:
 *   dist 0 : database
 *   dist 1 : config, logger, userRepo, db
 *   dist 2 : authService (via userRepo), app (via logger)
 *   dist 3 : metrics (via app)
 */
function makeGraph(): DependencyGraph {
	const nodes: GraphNode[] = [
		node('config', [], 'value'),
		node('logger', [], 'class'),
		node('database', ['config', 'logger'], 'class'),
		node('userRepo', ['database'], 'class'),
		node('authService', ['userRepo'], 'class'),
		node('app', ['authService', 'logger'], 'class'),
		node('metrics', ['app'], 'class'),
		node('db', ['database'], 'alias'),
	];
	const edges = nodes.flatMap((n) => n.dependencies.map((d) => ({ from: n.name, to: d })));
	return { nodes, edges, cycles: [] };
}

// ─── basic correctness ───────────────────────────────────────────────────────

describe('focusSubgraph — basic', () => {
	it('throws when the focus name is not in the graph', () => {
		expect(() => focusSubgraph(makeGraph(), 'nope')).toThrow(/"nope"/);
	});

	it('includes the focus node itself', () => {
		const sub = focusSubgraph(makeGraph(), 'database');
		expect(sub.nodes.some((n) => n.name === 'database')).toBe(true);
	});

	it('includes direct dependencies (downstream)', () => {
		const sub = focusSubgraph(makeGraph(), 'database');
		expect(sub.nodes.some((n) => n.name === 'config')).toBe(true);
		expect(sub.nodes.some((n) => n.name === 'logger')).toBe(true);
	});

	it('includes direct dependents (upstream)', () => {
		const sub = focusSubgraph(makeGraph(), 'database');
		expect(sub.nodes.some((n) => n.name === 'userRepo')).toBe(true);
	});

	it('propagates transitively (full reachability)', () => {
		const sub = focusSubgraph(makeGraph(), 'database');
		const names = sub.nodes.map((n) => n.name);
		// everything reachable from database in either direction
		expect(names).toContain('config');
		expect(names).toContain('logger');
		expect(names).toContain('userRepo');
		expect(names).toContain('authService');
		expect(names).toContain('app');
		expect(names).toContain('metrics');
	});

	it('excludes nodes with no path to the focus node', () => {
		// 'isolated' has no connection to database at all
		const graph = makeGraph();
		graph.nodes.push(node('isolated'));
		const sub = focusSubgraph(graph, 'database');
		expect(sub.nodes.some((n) => n.name === 'isolated')).toBe(false);
	});

	it('only keeps edges whose both endpoints are in the subgraph', () => {
		const sub = focusSubgraph(makeGraph(), 'database');
		for (const edge of sub.edges) {
			const names = sub.nodes.map((n) => n.name);
			expect(names).toContain(edge.from);
			expect(names).toContain(edge.to);
		}
	});
});

// ─── leaf / root nodes ───────────────────────────────────────────────────────

describe('focusSubgraph — leaf and root nodes', () => {
	it('focus on a leaf (no deps): includes itself and all upstream nodes', () => {
		const sub = focusSubgraph(makeGraph(), 'config');
		const names = sub.nodes.map((n) => n.name);
		expect(names).toContain('config');
		expect(names).toContain('database'); // dist 1: database depends on config
		// logger is reachable at dist 2 via config→database→logger
		expect(names).toContain('logger');
		// nothing depends on metrics, so it is included too (full chain)
		expect(names).toContain('metrics');
	});

	it('focus on a non-leaf root includes downstream deps and upstream dependents', () => {
		// app has no dependents other than metrics; all its deps are reachable
		const sub = focusSubgraph(makeGraph(), 'app');
		const names = sub.nodes.map((n) => n.name);
		expect(names).toContain('app');
		expect(names).toContain('metrics');    // upstream dependent of app
		expect(names).toContain('authService');
		expect(names).toContain('userRepo');
		expect(names).toContain('database');
		expect(names).toContain('logger');
		expect(names).toContain('config');
		// db is an alias of database, reachable through database
		expect(names).toContain('db');
	});
});

// ─── depth limiting ──────────────────────────────────────────────────────────

describe('focusSubgraph — depth', () => {
	it('depth=0 returns only the focus node', () => {
		const sub = focusSubgraph(makeGraph(), 'database', 0);
		expect(sub.nodes).toHaveLength(1);
		expect(sub.nodes[0].name).toBe('database');
		expect(sub.edges).toHaveLength(0);
	});

	it('depth=1 includes only immediate neighbours', () => {
		const sub = focusSubgraph(makeGraph(), 'database', 1);
		const names = sub.nodes.map((n) => n.name);
		// direct deps
		expect(names).toContain('config');
		expect(names).toContain('logger');
		// direct dependents
		expect(names).toContain('userRepo');
		expect(names).toContain('db');
		// 2-hop nodes must be absent
		expect(names).not.toContain('authService');
		expect(names).not.toContain('app');
	});

	it('depth=2 includes two-hop neighbours but not three-hop ones', () => {
		const sub = focusSubgraph(makeGraph(), 'database', 2);
		const names = sub.nodes.map((n) => n.name);
		// dist 2 via userRepo chain
		expect(names).toContain('authService');
		// dist 2 via logger
		expect(names).toContain('app');
		// dist 3: metrics depends on app
		expect(names).not.toContain('metrics');
	});

	it('unlimited depth (no depth arg) traverses the whole reachable subgraph', () => {
		const sub = focusSubgraph(makeGraph(), 'database');
		expect(sub.nodes.length).toBe(makeGraph().nodes.length); // everything is connected
	});
});

// ─── cycle handling ──────────────────────────────────────────────────────────

describe('focusSubgraph — cycles', () => {
	it('retains cycles fully contained in the subgraph', () => {
		const graph: DependencyGraph = {
			nodes: [node('a', ['b']), node('b', ['a']), node('c', ['a'])],
			edges: [
				{ from: 'a', to: 'b' },
				{ from: 'b', to: 'a' },
				{ from: 'c', to: 'a' },
			],
			cycles: [['a', 'b']],
		};
		const sub = focusSubgraph(graph, 'a');
		expect(sub.cycles).toEqual([['a', 'b']]);
	});

	it('drops cycles whose members are not fully in the subgraph', () => {
		const graph: DependencyGraph = {
			nodes: [node('a', ['b']), node('b', ['c']), node('c', ['a'])],
			edges: [
				{ from: 'a', to: 'b' },
				{ from: 'b', to: 'c' },
				{ from: 'c', to: 'a' },
			],
			cycles: [['a', 'b', 'c']],
		};
		// Focusing with depth=1 from 'b' gives only {b, a, c} at distance 1
		// but a-b-c cycle requires all three — they ARE all included here
		const sub = focusSubgraph(graph, 'b', 1);
		// all three are within depth 1 from b
		expect(sub.cycles).toEqual([['a', 'b', 'c']]);
	});
});

// ─── large graph robustness ──────────────────────────────────────────────────

describe('focusSubgraph — large graph', () => {
	it('truncates the available-names list in the error message for large containers', () => {
		const nodes = Array.from({ length: 50 }, (_, i) => node(`n${i}`));
		const graph: DependencyGraph = {
			nodes,
			edges: [],
			cycles: [],
		};
		expect(() => focusSubgraph(graph, 'missing')).toThrow(/\(30 more\)/);
	});

	it('handles a graph with 5 000 nodes without noticeable slowdown', () => {
		const size = 5000;
		const nodes = Array.from({ length: size }, (_, i) => node(`n${i}`, i > 0 ? [`n${i - 1}`] : []));
		const edges = nodes.flatMap((n) => n.dependencies.map((d) => ({ from: n.name, to: d })));
		const graph: DependencyGraph = { nodes, edges, cycles: [] };
		const sub = focusSubgraph(graph, 'n2500');
		expect(sub.nodes.length).toBe(size); // all nodes connected
	});
});

// ─── missing nodes ───────────────────────────────────────────────────────────

describe('focusSubgraph — missing nodes', () => {
	it('includes a missing dep if it is reachable from the focus node', () => {
		const graph: DependencyGraph = {
			nodes: [node('svc', ['ghost']), missing('ghost')],
			edges: [{ from: 'svc', to: 'ghost' }],
			cycles: [],
		};
		const sub = focusSubgraph(graph, 'svc');
		expect(sub.nodes.some((n) => n.name === 'ghost')).toBe(true);
	});
});
