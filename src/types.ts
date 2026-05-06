export type NodeType = 'class' | 'function' | 'value' | 'alias' | 'unknown';
export type Lifetime = 'SINGLETON' | 'TRANSIENT' | 'SCOPED';
export type ViolationSeverity = 'error' | 'warning';

export interface LifetimeViolation {
	/** The service with the longer lifetime */
	from: string;
	/** The dependency with the shorter lifetime */
	to: string;
	fromLifetime: Lifetime;
	toLifetime: Lifetime;
	severity: ViolationSeverity;
}

export interface GraphNode {
	name: string;
	type: NodeType | 'error';
	/** Dependency names as declared in the function/class parameters */
	dependencies: string[];
	/** True when the node is a dependency not registered in the container */
	missing: boolean;
	/** Awilix lifetime — absent for value / alias / missing nodes */
	lifetime?: Lifetime;
	/** Error message if node resolution failed */
	error?: string;
}

export interface GraphEdge {
	from: string;
	to: string;
}

export interface DependencyGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
	/** Each cycle is a list of node names forming the loop */
	cycles: string[][];
	/** Lifetime violations found in the graph (only present when built via buildGraph) */
	violations?: LifetimeViolation[];
}

export type OutputFormat = 'dot' | 'mermaid' | 'json' | 'html';
