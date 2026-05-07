import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { focusSubgraph, limitDepth } from './focus';
import { buildGraph } from './graph';
import { renderGraph } from './index';
import { inspectContainer } from './inspect';
import { loadContainer } from './load';
import { openGraph } from './open';
import { computeStats } from './stats';
import type { GraphStats, OutputFormat } from './types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
	.name('awilix-graph')
	.description(
		'Inspect an Awilix DI container and generate a visual dependency graph'
	)
	.version(version)
	.requiredOption(
		'-c, --container <path>',
		'Path to the file that exports the Awilix container'
	)
	.option(
		'-f, --format <format>',
		'Output format: dot | mermaid | json | html',
		'mermaid'
	)
	.option('-o, --output <file>', 'Write output to file instead of stdout')
	.option('--no-missing', 'Exclude unregistered (missing) dependency nodes')
	.option('--focus <name>', 'Show only the subgraph around this registration')
	.option(
		'--depth <n>',
		'Max traversal distance from the focus node (default: unlimited)'
	)
	.option(
		'--list',
		'Print a plain-text summary of all registrations instead of a graph'
	)
	.option(
		'--stats',
		'Print a metrics table: fan-in, fan-out, and instability for every node'
	)
	.option(
		'--open',
		'Open the graph in the browser after rendering (mermaid.live / GraphvizOnline / temp file for json)'
	)
	.option(
		'--fail-on <checks>',
		'Exit with code 1 when issues are found. Values: cycles, violations, all (comma-separated)'
	);

program.parse(process.argv);

const opts = program.opts<{
	container: string;
	format: string;
	output?: string;
	missing: boolean;
	focus?: string;
	depth?: string;
	list: boolean;
	stats: boolean;
	open: boolean;
	failOn?: string;
}>();

const validFormats: OutputFormat[] = ['dot', 'mermaid', 'json', 'html'];

async function run(): Promise<void> {
	if (!validFormats.includes(opts.format as OutputFormat)) {
		die(
			`Unknown format "${opts.format}". Choose one of: ${validFormats.join(', ')}`
		);
	}

	const container = await loadContainer(opts.container).catch((err) =>
		die(String(err.message))
	);
	const nodes = inspectContainer(container);

	const errorNodes = nodes.filter((n) => n.type === 'error');
	if (errorNodes.length > 0) {
		process.stderr.write(
			`\n⚠  ${errorNodes.length} node(s) could not be inspected due to errors.\n`
		);
		for (const n of errorNodes) {
			process.stderr.write(`   - ${n.name}: ${n.error || 'Unknown error'}\n`);
		}
	}

	const graph = buildGraph(nodes);

	if (!opts.missing) {
		graph.nodes = graph.nodes.filter((n) => !n.missing);
		graph.edges = graph.edges.filter(
			(e) =>
				graph.nodes.some((n) => n.name === e.from) &&
				graph.nodes.some((n) => n.name === e.to)
		);
	}

	if (opts.focus) {
		const depth = opts.depth !== undefined ? parseDepth(opts.depth) : undefined;
		try {
			Object.assign(graph, focusSubgraph(graph, opts.focus, depth));
		} catch (err) {
			die(err instanceof Error ? err.message : String(err));
		}
	} else if (opts.depth !== undefined) {
		const depth = parseDepth(opts.depth);
		Object.assign(graph, limitDepth(graph, depth));
	}

	if (opts.stats) {
		printStats(computeStats(graph));
		return;
	}

	if (opts.list) {
		printList(graph.nodes, graph.cycles);
		return;
	}

	const output = renderGraph(graph, opts.format as OutputFormat);

	if (opts.output) {
		const outPath = path.resolve(process.cwd(), opts.output);
		fs.writeFileSync(outPath, output, 'utf8');
		process.stderr.write(`Written to ${outPath}\n`);
	} else {
		process.stdout.write(`${output}\n`);
	}

	if (opts.open) {
		let openOutput = output;
		let openFormat = opts.format as OutputFormat;
		if (openFormat === 'mermaid' && output.length > 50_000) {
			process.stderr.write(
				'⚠  Mermaid source too large for mermaid.live — opening as HTML instead.\n'
			);
			openOutput = renderGraph(graph, 'html');
			openFormat = 'html';
		}
		const target = openGraph(openOutput, openFormat);
		process.stderr.write(`Opened: ${target}\n`);
	}

	const violations = graph.violations ?? [];
	const violationErrors = violations.filter((v) => v.severity === 'error');
	const violationWarnings = violations.filter((v) => v.severity === 'warning');

	if (violations.length > 0) {
		process.stderr.write(
			`\n⚠  Lifetime violations detected` +
				` (${violationErrors.length} error${violationErrors.length !== 1 ? 's' : ''},` +
				` ${violationWarnings.length} warning${violationWarnings.length !== 1 ? 's' : ''}):\n`
		);
		for (const v of violations) {
			const icon = v.severity === 'error' ? '✗' : '!';
			process.stderr.write(
				`   ${icon} ${v.from} [${v.fromLifetime}] → ${v.to} [${v.toLifetime}]\n`
			);
		}
	}

	if (graph.cycles.length > 0) {
		process.stderr.write(`\n⚠  Cycles detected (${graph.cycles.length}):\n`);
		for (const cycle of graph.cycles) {
			process.stderr.write(`   ${cycle.join(' → ')} → ${cycle[0]}\n`);
		}
	}

	const failOn = new Set(
		(opts.failOn ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	const failAll = failOn.has('all');
	if ((failAll || failOn.has('violations')) && violationErrors.length > 0)
		process.exit(1);
	if ((failAll || failOn.has('cycles')) && graph.cycles.length > 0)
		process.exit(1);
}

function printList(
	nodes: ReturnType<typeof inspectContainer>,
	cycles: string[][]
): void {
	const byType = {
		class: [] as string[],
		function: [] as string[],
		value: [] as string[],
		alias: [] as string[],
		unknown: [] as string[],
		error: [] as string[],
	};
	for (const n of nodes) {
		byType[n.type].push(n.name);
	}

	const icon: Record<string, string> = {
		class: '◆',
		function: '◇',
		value: '●',
		alias: '→',
		unknown: '?',
		error: '⚠',
	};

	const pluralLabel: Record<string, string> = {
		class: 'CLASSES',
		function: 'FUNCTIONS',
		value: 'VALUES',
		alias: 'ALIASES',
		unknown: 'UNKNOWNS',
		error: 'ERRORS',
	};

	for (const [type, names] of Object.entries(byType)) {
		if (!names.length) continue;
		process.stdout.write(`\n${pluralLabel[type]}\n`);
		for (const name of names) {
			// nodes is built from byType which is derived from the same nodes array, so find() always hits
			// biome-ignore lint/style/noNonNullAssertion: guaranteed to exist
			const node = nodes.find((n) => n.name === name)!;
			const lifetimeBadge = node.lifetime ? ` [${node.lifetime}]` : '';
			let suffix = '';
			if (node.type === 'alias') {
				suffix = ` → ${node.dependencies[0]}`;
			} else if (node.type === 'error') {
				suffix = node.error ? ` [${node.error}]` : ' [error]';
			} else if (node.dependencies.length) {
				suffix = ` → [${node.dependencies.join(', ')}]`;
			}
			process.stdout.write(
				`  ${icon[type]} ${name}${lifetimeBadge}${suffix}\n`
			);
		}
	}

	if (cycles.length > 0) {
		process.stdout.write('\nCYCLES\n');
		for (const cycle of cycles) {
			process.stdout.write(`  ⚠ ${cycle.join(' → ')} → ${cycle[0]}\n`);
		}
	}
}

function printStats(stats: GraphStats): void {
	const { nodeCount, missingCount, edgeCount, cycleCount, violationErrorCount, violationWarningCount, nodes } = stats;

	const parts: string[] = [`${nodeCount} node${nodeCount !== 1 ? 's' : ''}`];
	if (missingCount > 0) parts.push(`${missingCount} missing`);
	parts.push(`${edgeCount} edge${edgeCount !== 1 ? 's' : ''}`);
	parts.push(`${cycleCount} cycle${cycleCount !== 1 ? 's' : ''}`);
	const totalViolations = violationErrorCount + violationWarningCount;
	parts.push(`${totalViolations} violation${totalViolations !== 1 ? 's' : ''}`);

	process.stdout.write(`\nContainer stats: ${parts.join(' · ')}\n\n`);

	if (nodes.length === 0) return;

	const nameWidth = Math.max(4, ...nodes.map((n) => n.name.length));
	const typeWidth = Math.max(4, ...nodes.map((n) => n.type.length));
	const lifetimeWidth = 9; // 'SINGLETON'.length

	const col = (s: string, w: number) => s.padEnd(w);
	const rCol = (s: string, w: number) => s.padStart(w);

	const header =
		`  ${col('Name', nameWidth)}  ${col('Type', typeWidth)}  ${col('Lifetime', lifetimeWidth)}` +
		`  ${rCol('Fan-in', 7)}  ${rCol('Fan-out', 7)}  ${rCol('Instability', 11)}`;
	const divider = `  ${'─'.repeat(nameWidth + typeWidth + lifetimeWidth + 36)}`;

	process.stdout.write(`${header}\n${divider}\n`);

	for (const n of nodes) {
		const instStr = n.instability === null ? '—' : n.instability.toFixed(2);
		const row =
			`  ${col(n.name, nameWidth)}  ${col(n.type, typeWidth)}  ${col(n.lifetime ?? '—', lifetimeWidth)}` +
			`  ${rCol(String(n.fanIn), 7)}  ${rCol(String(n.fanOut), 7)}  ${rCol(instStr, 11)}`;
		process.stdout.write(`${row}\n`);
	}

	const isolated = nodes.filter((n) => n.instability === null);
	if (isolated.length > 0) {
		process.stdout.write(
			`\n  ${isolated.length} isolated node${isolated.length !== 1 ? 's' : ''} (fan-in = fan-out = 0): ${isolated.map((n) => n.name).join(', ')}\n`
		);
	}
	process.stdout.write('\n');
}

function parseDepth(raw: string): number {
	const n = Number.parseInt(raw, 10);
	if (Number.isNaN(n) || n < 0)
		die(`--depth must be a non-negative integer, got "${raw}"`);
	return n;
}

function die(msg: string): never {
	process.stderr.write(`Error: ${msg}\n`);
	process.exit(1);
}

run().catch((err) => {
	process.stderr.write(
		`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`
	);
	process.exit(1);
});
