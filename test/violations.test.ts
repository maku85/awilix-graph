import { describe, expect, it } from 'vitest';
import { detectViolations } from '../src/violations';
import { buildGraph } from '../src/graph';
import type { GraphEdge, GraphNode } from '../src/types';

function node(
	name: string,
	deps: string[] = [],
	lifetime?: GraphNode['lifetime']
): GraphNode {
	return { name, type: 'class', dependencies: deps, missing: false, lifetime };
}

function edge(from: string, to: string): GraphEdge {
	return { from, to };
}

// ─── detectViolations unit tests ─────────────────────────────────────────────

describe('detectViolations', () => {
	it('returns no violations when all lifetimes match', () => {
		const nodes = [node('a', ['b'], 'SINGLETON'), node('b', [], 'SINGLETON')];
		expect(detectViolations(nodes, [edge('a', 'b')])).toEqual([]);
	});

	it('returns no violations when dependency has a longer lifetime', () => {
		const nodes = [node('a', ['b'], 'TRANSIENT'), node('b', [], 'SINGLETON')];
		expect(detectViolations(nodes, [edge('a', 'b')])).toEqual([]);
	});

	it('detects SINGLETON → TRANSIENT as an error', () => {
		const nodes = [node('svc', ['dep'], 'SINGLETON'), node('dep', [], 'TRANSIENT')];
		const [v] = detectViolations(nodes, [edge('svc', 'dep')]);
		expect(v.severity).toBe('error');
		expect(v.from).toBe('svc');
		expect(v.to).toBe('dep');
		expect(v.fromLifetime).toBe('SINGLETON');
		expect(v.toLifetime).toBe('TRANSIENT');
	});

	it('detects SINGLETON → SCOPED as an error', () => {
		const nodes = [node('svc', ['dep'], 'SINGLETON'), node('dep', [], 'SCOPED')];
		const [v] = detectViolations(nodes, [edge('svc', 'dep')]);
		expect(v.severity).toBe('error');
	});

	it('detects SCOPED → TRANSIENT as a warning', () => {
		const nodes = [node('svc', ['dep'], 'SCOPED'), node('dep', [], 'TRANSIENT')];
		const [v] = detectViolations(nodes, [edge('svc', 'dep')]);
		expect(v.severity).toBe('warning');
	});

	it('ignores edges where either node has no declared lifetime', () => {
		const nodes = [node('svc', ['dep']), node('dep', [], 'TRANSIENT')];
		expect(detectViolations(nodes, [edge('svc', 'dep')])).toEqual([]);
	});

	it('ignores edges to missing nodes (no lifetime)', () => {
		const nodes = [node('svc', ['ghost'], 'SINGLETON')];
		expect(detectViolations(nodes, [edge('svc', 'ghost')])).toEqual([]);
	});

	it('detects multiple violations in a single graph', () => {
		const nodes = [
			node('root', ['a', 'b'], 'SINGLETON'),
			node('a', [], 'TRANSIENT'),
			node('b', [], 'SCOPED'),
		];
		const edges = [edge('root', 'a'), edge('root', 'b')];
		const v = detectViolations(nodes, edges);
		expect(v).toHaveLength(2);
		expect(v.every((x) => x.severity === 'error')).toBe(true);
	});
});

// ─── integration: buildGraph populates violations ────────────────────────────

describe('buildGraph violations integration', () => {
	it('graph.violations is populated by buildGraph', () => {
		const nodes = [
			node('repo', ['db'], 'SINGLETON'),
			node('db', [], 'TRANSIENT'),
		];
		const { violations } = buildGraph(nodes);
		expect(violations).toHaveLength(1);
		expect(violations![0].severity).toBe('error');
	});

	it('graph.violations is empty when no violations exist', () => {
		const nodes = [node('a', ['b'], 'TRANSIENT'), node('b', [], 'SINGLETON')];
		const { violations } = buildGraph(nodes);
		expect(violations).toEqual([]);
	});
});

// ─── severity rules ───────────────────────────────────────────────────────────

describe('detectViolations — all severity combinations', () => {
	const cases: Array<[GraphNode['lifetime'], GraphNode['lifetime'], string | null]> = [
		['SINGLETON', 'SINGLETON', null],
		['SINGLETON', 'SCOPED',    'error'],
		['SINGLETON', 'TRANSIENT', 'error'],
		['SCOPED',    'SINGLETON', null],
		['SCOPED',    'SCOPED',    null],
		['SCOPED',    'TRANSIENT', 'warning'],
		['TRANSIENT', 'SINGLETON', null],
		['TRANSIENT', 'SCOPED',    null],
		['TRANSIENT', 'TRANSIENT', null],
	];

	for (const [fromL, toL, expected] of cases) {
		it(`${fromL} → ${toL}: ${expected ?? 'no violation'}`, () => {
			const nodes = [node('a', ['b'], fromL), node('b', [], toL)];
			const result = detectViolations(nodes, [edge('a', 'b')]);
			if (expected === null) {
				expect(result).toEqual([]);
			} else {
				expect(result).toHaveLength(1);
				expect(result[0].severity).toBe(expected);
			}
		});
	}
});
