export type NodeType = 'class' | 'function' | 'value' | 'alias' | 'unknown';
export type Lifetime = 'SINGLETON' | 'TRANSIENT' | 'SCOPED';

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
}

export type OutputFormat = 'dot' | 'mermaid' | 'json' | 'html';
