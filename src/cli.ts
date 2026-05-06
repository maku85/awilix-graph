import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { focusSubgraph, limitDepth } from './focus';
import { buildGraph } from './graph';
import { renderGraph } from './index';
import { inspectContainer } from './inspect';
import { loadContainer } from './load';
import { openGraph } from './open';
import type { OutputFormat } from './types';

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
		'--open',
		'Open the graph in the browser after rendering (mermaid.live / GraphvizOnline / temp file for json)'
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
	open: boolean;
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

	if (graph.cycles.length > 0) {
		process.stderr.write(`\n⚠  Cycles detected (${graph.cycles.length}):\n`);
		for (const cycle of graph.cycles) {
			process.stderr.write(`   ${cycle.join(' → ')} → ${cycle[0]}\n`);
		}
	}
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
