export { parseDependencies } from './deps';
export { focusSubgraph, limitDepth } from './focus';
export { formatDot } from './format/dot';
export { formatHtml } from './format/html';
export { formatJson } from './format/json';
export { formatMermaid } from './format/mermaid';
export { buildGraph } from './graph';
export { inspectContainer } from './inspect';
export { computeStats } from './stats';
export type {
	DependencyGraph,
	GraphEdge,
	GraphNode,
	GraphStats,
	Lifetime,
	LifetimeViolation,
	NodeStats,
	NodeType,
	OutputFormat,
	ViolationSeverity,
} from './types';
export { detectViolations } from './violations';

import { formatDot } from './format/dot';
import { formatHtml } from './format/html';
import { formatJson } from './format/json';
import { formatMermaid } from './format/mermaid';
import { buildGraph } from './graph';
import { inspectContainer } from './inspect';
import type { DependencyGraph, OutputFormat } from './types';

interface AwilixContainer {
	registrations: Record<string, unknown>;
}

/**
 * High-level API: inspect a container and return the rendered graph string.
 *
 * @example
 * import { createContainer, asClass } from 'awilix'
 * import { render } from 'awilix-graph'
 *
 * const container = createContainer().register({ ... })
 * console.log(render(container, 'mermaid'))
 */
export function render(
	container: AwilixContainer,
	format: OutputFormat = 'mermaid'
): string {
	const graph = inspect(container);
	return renderGraph(graph, format);
}

/**
 * Inspect a container and return the raw graph data structure.
 */
export function inspect(container: AwilixContainer): DependencyGraph {
	const nodes = inspectContainer(container);
	return buildGraph(nodes);
}

export function renderGraph(
	graph: DependencyGraph,
	format: OutputFormat
): string {
	switch (format) {
		case 'dot':
			return formatDot(graph);
		case 'mermaid':
			return formatMermaid(graph);
		case 'json':
			return formatJson(graph);
		case 'html':
			return formatHtml(graph);
	}
}
