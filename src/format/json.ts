import type { DependencyGraph } from '../types';

export function formatJson(graph: DependencyGraph): string {
	return JSON.stringify(graph, null, 2);
}
