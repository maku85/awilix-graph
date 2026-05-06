import { describe, expect, it } from 'vitest';
import { formatDot } from '../src/format/dot';
import { formatHtml } from '../src/format/html';
import { formatJson } from '../src/format/json';
import { formatMermaid } from '../src/format/mermaid';
import type { DependencyGraph, GraphNode } from '../src/types';

function makeGraph(overrides: Partial<DependencyGraph> = {}): DependencyGraph {
	return {
		nodes: [
			{ name: 'logger',   type: 'class',    dependencies: [],         missing: false, lifetime: 'SINGLETON' },
			{ name: 'database', type: 'class',    dependencies: ['logger'], missing: false, lifetime: 'SCOPED' },
			{ name: 'token',    type: 'function', dependencies: ['config'], missing: false, lifetime: 'TRANSIENT' },
			{ name: 'config',   type: 'value',    dependencies: [],         missing: false },
			{ name: 'log',      type: 'alias',    dependencies: ['logger'], missing: false },
			{ name: 'ghost',    type: 'unknown',  dependencies: [],         missing: true },
		],
		edges: [
			{ from: 'database', to: 'logger' },
			{ from: 'token', to: 'config' },
			{ from: 'log', to: 'logger' },
		],
		cycles: [],
		...overrides,
	};
}

describe('formatMermaid', () => {
	it('starts with "graph LR"', () => {
		expect(formatMermaid(makeGraph())).toMatch(/^graph LR/);
	});

	it('uses box shape for class nodes', () => {
		expect(formatMermaid(makeGraph())).toContain('logger["logger');
	});

	it('uses round shape for function nodes', () => {
		expect(formatMermaid(makeGraph())).toContain('token("token');
	});

	it('uses double-brace shape for value nodes', () => {
		expect(formatMermaid(makeGraph())).toContain('config{{"config');
	});

	it('uses parallelogram shape for alias nodes', () => {
		expect(formatMermaid(makeGraph())).toContain('log[/"log');
	});

	it('emits --> for normal edges', () => {
		expect(formatMermaid(makeGraph())).toContain('database --> logger');
	});

	it('emits dashed alias arrow for alias edges', () => {
		expect(formatMermaid(makeGraph())).toContain('log -. alias .-> ');
	});

	it('emits dashed cycle arrow for cycle edges', () => {
		const graph = makeGraph({
			edges: [
				{ from: 'a', to: 'b' },
				{ from: 'b', to: 'a' },
			],
			nodes: [
				{ name: 'a', type: 'class', dependencies: ['b'], missing: false },
				{ name: 'b', type: 'class', dependencies: ['a'], missing: false },
			],
			cycles: [['a', 'b']],
		});
		expect(formatMermaid(graph)).toContain('-. cycle .->')
	});

	it('emits classDef for all node types', () => {
		const output = formatMermaid(makeGraph());
		expect(output).toContain('classDef classNode');
		expect(output).toContain('classDef funcNode');
		expect(output).toContain('classDef valueNode');
		expect(output).toContain('classDef aliasNode');
		expect(output).toContain('classDef missingNode');
	});

	it('assigns correct CSS class to each node', () => {
		const output = formatMermaid(makeGraph());
		expect(output).toContain('classNode');
		expect(output).toContain('aliasNode');
		expect(output).toContain('missingNode');
	});

	it('includes lifetime in the node label', () => {
		const out = formatMermaid(makeGraph());
		expect(out).toContain('class · SINGLETON');
		expect(out).toContain('class · SCOPED');
		expect(out).toContain('function · TRANSIENT');
	});

	it('omits lifetime segment when lifetime is absent', () => {
		const out = formatMermaid(makeGraph());
		// config (value) and log (alias) have no lifetime
		expect(out).toContain('config<br/>(value)');
		expect(out).toContain('log<br/>(alias)');
	});

	it('sanitises hyphens in node IDs', () => {
		const graph = makeGraph({
			nodes: [{ name: 'my-service', type: 'class', dependencies: [], missing: false }],
			edges: [],
		});
		expect(formatMermaid(graph)).toContain('my_service[');
	});

	it('disambiguates node IDs that would otherwise collide after sanitisation', () => {
		// "my-svc" and "my.svc" both sanitise to "my_svc" — they must get distinct IDs
		const graph = makeGraph({
			nodes: [
				{ name: 'my-svc', type: 'class', dependencies: [], missing: false },
				{ name: 'my.svc', type: 'class', dependencies: [], missing: false },
			],
			edges: [],
		});
		const out = formatMermaid(graph);
		expect(out).toContain('my_svc_0[');
		expect(out).toContain('my_svc_1[');
	});

	it('appends cycle comment when cycles exist', () => {
		const graph = makeGraph({ cycles: [['a', 'b']] });
		expect(formatMermaid(graph)).toContain('%% Cycle:');
	});
});

describe('formatDot', () => {
	it('starts with digraph declaration', () => {
		expect(formatDot(makeGraph())).toMatch(/^digraph AwilixDependencies/);
	});

	it('emits a node statement for each node', () => {
		const output = formatDot(makeGraph());
		for (const name of ['logger', 'database', 'token', 'config', 'log', 'ghost']) {
			expect(output).toContain(`"${name}"`);
		}
	});

	it('uses diamond shape for value nodes', () => {
		expect(formatDot(makeGraph())).toContain('shape=diamond');
	});

	it('uses ellipse shape for function nodes', () => {
		expect(formatDot(makeGraph())).toContain('shape=ellipse');
	});

	it('uses dashed style for missing nodes', () => {
		expect(formatDot(makeGraph())).toContain('style="filled,dashed"');
	});

	it('uses dashed arrow with alias label for alias edges', () => {
		const output = formatDot(makeGraph());
		expect(output).toContain('style=dashed');
		expect(output).toContain('label="alias"');
	});

	it('marks cycle edges with red color', () => {
		const graph = makeGraph({
			edges: [
				{ from: 'a', to: 'b' },
				{ from: 'b', to: 'a' },
			],
			nodes: [
				{ name: 'a', type: 'class', dependencies: ['b'], missing: false },
				{ name: 'b', type: 'class', dependencies: ['a'], missing: false },
			],
			cycles: [['a', 'b']],
		});
		expect(formatDot(graph)).toContain('color="#d44"');
	});

	it('includes lifetime in the node label', () => {
		const out = formatDot(makeGraph());
		expect(out).toContain('[SINGLETON]');
		expect(out).toContain('[SCOPED]');
		expect(out).toContain('[TRANSIENT]');
	});

	it('uses peripheries=2 for SINGLETON nodes', () => {
		expect(formatDot(makeGraph())).toContain('peripheries=2');
	});

	it('uses penwidth=2 for SCOPED nodes', () => {
		expect(formatDot(makeGraph())).toContain('penwidth=2');
	});

	it('omits lifetime suffix when lifetime is absent', () => {
		const out = formatDot(makeGraph());
		// config (value) has no lifetime — its label must not contain brackets
		expect(out).toMatch(/"config"[^;]*label="config\\n\(value\)"/);
	});

	it('escapes quotes in node names', () => {
		const graph = makeGraph({
			nodes: [{ name: 'say "hello"', type: 'value', dependencies: [], missing: false }],
			edges: [],
		});
		expect(formatDot(graph)).toContain('\\"hello\\"');
	});
});

describe('formatJson', () => {
	it('returns valid JSON', () => {
		expect(() => JSON.parse(formatJson(makeGraph()))).not.toThrow();
	});

	it('includes nodes, edges, and cycles keys', () => {
		const parsed = JSON.parse(formatJson(makeGraph()));
		expect(parsed).toHaveProperty('nodes');
		expect(parsed).toHaveProperty('edges');
		expect(parsed).toHaveProperty('cycles');
	});

	it('serialises alias node type correctly', () => {
		const parsed = JSON.parse(formatJson(makeGraph()));
		const alias = parsed.nodes.find((n: { name: string }) => n.name === 'log');
		expect(alias?.type).toBe('alias');
		expect(alias?.dependencies).toEqual(['logger']);
	});

	it('serialises missing flag correctly', () => {
		const parsed = JSON.parse(formatJson(makeGraph()));
		const ghost = parsed.nodes.find((n: { name: string }) => n.name === 'ghost');
		expect(ghost?.missing).toBe(true);
	});
});

describe('formatHtml chunking', () => {
	function makeNode(name: string): GraphNode {
		return { name, type: 'class', dependencies: [], missing: false };
	}

	it('produces a single diagram for graphs with ≤ 40 nodes', () => {
		const nodes = Array.from({ length: 40 }, (_, i) => makeNode(`n${i}`));
		const out = formatHtml({ nodes, edges: [], cycles: [] });
		expect((out.match(/id="diagram-/g) ?? []).length).toBe(1);
	});

	it('splits into multiple diagrams for graphs with > 40 nodes', () => {
		const nodes = Array.from({ length: 41 }, (_, i) => makeNode(`n${i}`));
		const out = formatHtml({ nodes, edges: [], cycles: [] });
		expect((out.match(/id="diagram-/g) ?? []).length).toBe(2);
	});

	it('generates a cross-link pointing to the correct target diagram', () => {
		// n0 lands in diagram-1 (block 0, indices 0–39), n40 in diagram-2 (block 1)
		const nodes = Array.from({ length: 82 }, (_, i) => makeNode(`n${i}`));
		const out = formatHtml({ nodes, edges: [{ from: 'n0', to: 'n40' }], cycles: [] });
		expect(out).toContain('href="#diagram-2"');
		expect(out).toContain('n40 (Diagram 2)');
	});

	it('cross-links reference correct diagram when sub-chunking shifts indices', () => {
		// Build a block-0 whose Mermaid output will be large enough to trigger sub-chunking.
		// We achieve this by giving every node a very long name (padding to ~1 200 chars each,
		// so 40 nodes × ~1 200 chars ≈ 48 000 chars — right at the limit).
		const pad = 'x'.repeat(1180);
		const block0 = Array.from({ length: 40 }, (_, i) => makeNode(`${pad}${i}`));
		// block1 has one regular node that block0's first node links to
		const block1Node = makeNode('target');
		const nodes = [...block0, block1Node];
		const out = formatHtml({
			nodes,
			edges: [{ from: block0[0].name, to: 'target' }],
			cycles: [],
		});
		// block0 gets sub-chunked into 4 diagrams (10 nodes each) → target is in diagram-5
		expect(out).toContain('href="#diagram-5"');
		expect(out).toContain('target (Diagram 5)');
	});
});

describe('formatHtml', () => {
	it('returns a valid HTML5 document', () => {
		const out = formatHtml(makeGraph());
		expect(out).toMatch(/^<!DOCTYPE html>/);
		expect(out).toContain('</html>');
	});

	it('embeds the Mermaid CDN script', () => {
		expect(formatHtml(makeGraph())).toContain('cdn.jsdelivr.net/npm/mermaid');
	});

	it('embeds the mermaid diagram source', () => {
		const out = formatHtml(makeGraph());
		expect(out).toContain('graph LR');
		expect(out).toContain('class="mermaid"');
	});

	it('shows correct node count in stats (excludes missing)', () => {
		// makeGraph has 5 non-missing nodes and 1 missing (ghost)
		expect(formatHtml(makeGraph())).toContain('5 nodes');
	});

	it('shows missing count when there are missing nodes', () => {
		expect(formatHtml(makeGraph())).toContain('1 missing');
	});

	it('shows edge count in stats', () => {
		// makeGraph has 3 edges
		expect(formatHtml(makeGraph())).toContain('3 edges');
	});

	it('omits cycle section when there are no cycles', () => {
		expect(formatHtml(makeGraph())).not.toContain('Cycles');
	});

	it('renders cycle section when cycles are present', () => {
		const graph = makeGraph({ cycles: [['a', 'b']] });
		const out = formatHtml(graph);
		expect(out).toContain('Cycles (1)');
		expect(out).toContain('a → b → a');
	});

	it('includes a legend for all node types', () => {
		const out = formatHtml(makeGraph());
		for (const label of ['class', 'function', 'value', 'alias', 'missing']) {
			expect(out).toContain(label);
		}
	});
});
