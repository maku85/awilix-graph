/**
 * End-to-end integration tests against examples/container.js.
 *
 * Two layers:
 *  1. Programmatic — calls the library API directly (fast, no subprocess).
 *  2. CLI subprocess — spawns the CLI via ts-node to cover flag parsing and
 *     stdout/stderr output (one test per major feature flag).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph';
import { renderGraph } from '../src/index';
import { inspectContainer } from '../src/inspect';
import { loadContainer } from '../src/load';
import type { DependencyGraph } from '../src/types';

// ── shared paths ──────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const CONTAINER_FILE = path.join(ROOT, 'examples/container.js');
const CLI_ENTRY = path.join(ROOT, 'src/cli.ts');

// ── 1. Programmatic E2E ───────────────────────────────────────────────────────

describe('Programmatic E2E — examples/container.js', () => {
	let graph: DependencyGraph;

	beforeAll(async () => {
		const container = await loadContainer(CONTAINER_FILE);
		const nodes = inspectContainer(container);
		graph = buildGraph(nodes);
	});

	// ── node detection ────────────────────────────────────────────────────────

	it('detects all registered nodes', () => {
		const names = graph.nodes.map((n) => n.name);
		for (const expected of [
			'config', 'logger', 'database',
			'userRepository', 'orderRepository',
			'tokenService', 'authService', 'orderService', 'emailService',
		]) {
			expect(names).toContain(expected);
		}
	});

	it('adds smtpClient as a missing node', () => {
		const node = graph.nodes.find((n) => n.name === 'smtpClient');
		expect(node?.missing).toBe(true);
	});

	it('classifies node types correctly', () => {
		const byName = Object.fromEntries(graph.nodes.map((n) => [n.name, n.type]));
		expect(byName.config).toBe('value');
		expect(byName.tokenService).toBe('function');
		expect(byName.logger).toBe('class');
		expect(byName.database).toBe('class');
	});

	it('builds correct dependency edges', () => {
		const edgeKey = (from: string, to: string) => `${from}->${to}`;
		const edgeSet = new Set(graph.edges.map((e) => edgeKey(e.from, e.to)));
		expect(edgeSet.has(edgeKey('database', 'logger'))).toBe(true);
		expect(edgeSet.has(edgeKey('database', 'config'))).toBe(true);
		expect(edgeSet.has(edgeKey('authService', 'userRepository'))).toBe(true);
		expect(edgeSet.has(edgeKey('emailService', 'smtpClient'))).toBe(true);
	});

	it('detects no cycles in the example container', () => {
		expect(graph.cycles).toHaveLength(0);
	});

	// ── format rendering ──────────────────────────────────────────────────────

	it('renders valid Mermaid output', () => {
		const out = renderGraph(graph, 'mermaid');
		expect(out).toMatch(/^graph LR/);
		expect(out).toContain('database');
		expect(out).toContain('smtpClient');
	});

	it('renders valid DOT output', () => {
		const out = renderGraph(graph, 'dot');
		expect(out).toMatch(/^digraph AwilixDependencies/);
		expect(out).toContain('"database"');
	});

	it('renders valid JSON with all nodes and edges', () => {
		const parsed = JSON.parse(renderGraph(graph, 'json'));
		expect(parsed.nodes.length).toBe(graph.nodes.length);
		expect(parsed.edges.length).toBe(graph.edges.length);
		expect(parsed.cycles).toEqual([]);
	});

	it('renders valid self-contained HTML', () => {
		const out = renderGraph(graph, 'html');
		expect(out).toMatch(/^<!DOCTYPE html>/i);
		expect(out).toContain('vis-network');
		expect(out).toContain('new vis.Network(');
	});
});

// ── 2. CLI subprocess E2E ─────────────────────────────────────────────────────

/**
 * Spawn the CLI via ts-node and return stdout, stderr, and exit code.
 */
function cli(args: string[]): { out: string; err: string; code: number } {
	const result = spawnSync(
		process.execPath,
		['--require', 'ts-node/register', CLI_ENTRY, '--container', CONTAINER_FILE, ...args],
		{ encoding: 'utf8', cwd: ROOT, timeout: 30_000 }
	);
	return {
		out: result.stdout ?? '',
		err: result.stderr ?? '',
		code: result.status ?? 1,
	};
}

describe('CLI E2E — default (mermaid)', () => {
	it('exits 0 and emits a mermaid graph', () => {
		const { out, code } = cli([]);
		expect(code).toBe(0);
		expect(out).toMatch(/^graph LR/);
	});

	it('includes known registrations in the output', () => {
		const { out } = cli([]);
		expect(out).toContain('database');
		expect(out).toContain('authService');
	});
});

describe('CLI E2E — --format dot', () => {
	it('emits a digraph', () => {
		const { out, code } = cli(['--format', 'dot']);
		expect(code).toBe(0);
		expect(out).toMatch(/^digraph AwilixDependencies/);
	});
});

describe('CLI E2E — --format json', () => {
	it('emits parseable JSON with nodes and edges', () => {
		const { out, code } = cli(['--format', 'json']);
		expect(code).toBe(0);
		const parsed = JSON.parse(out);
		expect(Array.isArray(parsed.nodes)).toBe(true);
		expect(Array.isArray(parsed.edges)).toBe(true);
		expect(parsed.nodes.length).toBeGreaterThan(0);
	});

	it('includes the missing smtpClient node by default', () => {
		const { out } = cli(['--format', 'json']);
		const parsed = JSON.parse(out);
		const missing = parsed.nodes.find((n: { name: string }) => n.name === 'smtpClient');
		expect(missing?.missing).toBe(true);
	});

	it('--no-missing excludes missing nodes', () => {
		const { out, code } = cli(['--format', 'json', '--no-missing']);
		expect(code).toBe(0);
		const parsed = JSON.parse(out);
		expect(parsed.nodes.every((n: { missing: boolean }) => !n.missing)).toBe(true);
	});
});

describe('CLI E2E — --format html', () => {
	it('emits a self-contained HTML document', () => {
		const { out, code } = cli(['--format', 'html']);
		expect(code).toBe(0);
		expect(out).toMatch(/<!DOCTYPE html>/i);
		expect(out).toContain('vis-network');
	});
});

describe('CLI E2E — --list', () => {
	it('prints CLASSES, FUNCTIONS, VALUES sections', () => {
		const { out, code } = cli(['--list']);
		expect(code).toBe(0);
		expect(out).toContain('CLASSES');
		expect(out).toContain('FUNCTIONS');
		expect(out).toContain('VALUES');
	});

	it('shows the missing smtpClient under UNKNOWNS', () => {
		const { out } = cli(['--list']);
		expect(out).toContain('UNKNOWNS');
		expect(out).toContain('smtpClient');
	});

	it('lists each class with its lifetime badge and dependency arrow', () => {
		const { out } = cli(['--list']);
		// database is registered as SINGLETON in examples/container.js
		expect(out).toContain('◆ database [SINGLETON] → [logger, config]');
	});
});

describe('CLI E2E — --focus', () => {
	it('restricts the graph to the focus subgraph', () => {
		const { out, code } = cli(['--format', 'json', '--focus', 'authService', '--depth', '1']);
		expect(code).toBe(0);
		const parsed = JSON.parse(out);
		const names: string[] = parsed.nodes.map((n: { name: string }) => n.name);
		expect(names).toContain('authService');
		expect(names).toContain('userRepository');
		expect(names).toContain('tokenService');
		expect(names).toContain('orderService');
		// nodes outside depth-1 neighbourhood must be absent
		expect(names).not.toContain('database');
		expect(names).not.toContain('config');
	});

	it('exits non-zero for an unknown focus name', () => {
		const { err, code } = cli(['--focus', 'doesNotExist']);
		expect(code).not.toBe(0);
		expect(err).toContain('"doesNotExist"');
	});
});

describe('CLI E2E — --depth (standalone)', () => {
	it('limits the graph to nodes within depth from root', () => {
		const { out, code } = cli(['--format', 'json', '--depth', '1']);
		expect(code).toBe(0);
		const parsed = JSON.parse(out);
		const names: string[] = parsed.nodes.map((n: { name: string }) => n.name);
		// Root nodes and their direct deps must be present
		expect(names).toContain('orderService');
		expect(names).toContain('emailService');
		// Nodes 2+ hops away must be absent
		expect(names).not.toContain('database');
		expect(names).not.toContain('userRepository');
	});
});

describe('CLI E2E — --output', () => {
	let tmpFile: string;

	afterAll(() => {
		if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
	});

	it('writes output to a file and exits 0', () => {
		tmpFile = path.join(os.tmpdir(), `awilix-graph-e2e-${Date.now()}.mermaid`);
		const { code, err } = cli(['--output', tmpFile]);
		expect(code).toBe(0);
		expect(fs.existsSync(tmpFile)).toBe(true);
		const content = fs.readFileSync(tmpFile, 'utf8');
		expect(content).toMatch(/^graph LR/);
		expect(err).toContain('Written to');
	});
});

describe('CLI E2E — error handling', () => {
	it('exits non-zero for an invalid format', () => {
		const { err, code } = cli(['--format', 'bogus']);
		expect(code).not.toBe(0);
		expect(err).toContain('Unknown format');
	});

	it('exits non-zero when the container file does not exist', () => {
		const result = spawnSync(
			process.execPath,
			['--require', 'ts-node/register', CLI_ENTRY, '--container', '/no/such/file.js'],
			{ encoding: 'utf8', cwd: ROOT, timeout: 30_000 }
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('Container file not found');
	});
});
