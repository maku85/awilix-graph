/**
 * Integration tests against a large, realistic container that exercises:
 *   - all node types (class, function, value, alias, error, missing)
 *   - all lifetime combinations, including violations (error + warning)
 *   - broken resolvers that throw during inspection
 *   - duplicate dependencies (regression for vis.js "id already exists" crash)
 *   - all output formats
 *   - focus/depth subgraph on a big graph
 */

import {
	Lifetime,
	aliasTo,
	asClass,
	asFunction,
	asValue,
	createContainer,
} from 'awilix';
import { beforeAll, describe, expect, it } from 'vitest';
import { focusSubgraph } from '../src/focus';
import { buildGraph } from '../src/graph';
import { renderGraph } from '../src/index';
import { inspectContainer } from '../src/inspect';
import type { DependencyGraph, GraphNode, OutputFormat } from '../src/types';

// ── Fixture classes & factories ───────────────────────────────────────────────

// Config objects (registered as values)
const appConfig = { port: 3000, jwtSecret: 'test-secret', env: 'test' };
const dbConfig = { host: 'localhost', port: 5432 };
const redisConfig = { host: 'localhost', port: 6379 };

// Infrastructure
class Logger { info(_msg: string) {} }

class Database {
	constructor({ dbConfig, logger }: { dbConfig: object; logger: Logger }) {
		void dbConfig; void logger;
	}
}

class RedisClient {
	constructor({ redisConfig, logger }: { redisConfig: object; logger: Logger }) {
		void redisConfig; void logger;
	}
}

// TRANSIENT — injecting into SINGLETON (authService) is an error;
// injecting into SCOPED (productService) is a warning.
class HttpClient {
	constructor({ logger, appConfig }: { logger: Logger; appConfig: object }) {
		void logger; void appConfig;
	}
}

// Depends on unregistered smtpClient → produces a missing node in the graph
class Mailer {
	constructor({ smtpClient, logger }: { smtpClient: unknown; logger: Logger }) {
		void smtpClient; void logger;
	}
}

// Repositories (all SINGLETON)
class UserRepository {
	constructor({ database, logger }: { database: Database; logger: Logger }) {
		void database; void logger;
	}
}
class OrderRepository {
	constructor({ database, logger }: { database: Database; logger: Logger }) {
		void database; void logger;
	}
}
class ProductRepository {
	constructor({ database }: { database: Database }) {
		void database;
	}
}
class SessionStore {
	constructor({ database, redisClient }: { database: Database; redisClient: RedisClient }) {
		void database; void redisClient;
	}
}

// Services
const makeTokenService = ({ appConfig }: { appConfig: object }) => ({ appConfig });

// TRANSIENT → authService (SINGLETON) depending on this is a lifetime error
const makePasswordHasher = ({ logger }: { logger: Logger }) => ({ logger });

class AuthService {
	constructor({ userRepository, tokenService, passwordHasher }: {
		userRepository: UserRepository;
		tokenService: object;
		passwordHasher: object;
	}) { void userRepository; void tokenService; void passwordHasher; }
}
class OrderService {
	constructor({ orderRepository, userRepository, mailer }: {
		orderRepository: OrderRepository;
		userRepository: UserRepository;
		mailer: Mailer;
	}) { void orderRepository; void userRepository; void mailer; }
}
class CacheService {
	constructor({ redisClient }: { redisClient: RedisClient }) {
		void redisClient;
	}
}
// SCOPED + depends on TRANSIENT httpClient → lifetime warning
class ProductService {
	constructor({ productRepository, cacheService, httpClient }: {
		productRepository: ProductRepository;
		cacheService: CacheService;
		httpClient: HttpClient;
	}) { void productRepository; void cacheService; void httpClient; }
}
class NotificationService {
	constructor({ mailer, logger }: { mailer: Mailer; logger: Logger }) {
		void mailer; void logger;
	}
}

// Controllers
class UserController {
	constructor({ authService, userRepository }: {
		authService: AuthService;
		userRepository: UserRepository;
	}) { void authService; void userRepository; }
}
class OrderController {
	constructor({ orderService, authService, sessionStore }: {
		orderService: OrderService;
		authService: AuthService;
		sessionStore: SessionStore;
	}) { void orderService; void authService; void sessionStore; }
}

// ── Container factory ─────────────────────────────────────────────────────────

function buildComplexContainer() {
	const c = createContainer();
	c.register({
		// values (no lifetime)
		appConfig:  asValue(appConfig),
		dbConfig:   asValue(dbConfig),
		redisConfig: asValue(redisConfig),

		// infrastructure
		logger:      asClass(Logger,      { lifetime: Lifetime.SINGLETON }),
		database:    asClass(Database,    { lifetime: Lifetime.SINGLETON }),
		redisClient: asClass(RedisClient, { lifetime: Lifetime.SINGLETON }),
		httpClient:  asClass(HttpClient,  { lifetime: Lifetime.TRANSIENT }),
		mailer:      asClass(Mailer,      { lifetime: Lifetime.SINGLETON }),

		// repositories
		userRepository:    asClass(UserRepository,    { lifetime: Lifetime.SINGLETON }),
		orderRepository:   asClass(OrderRepository,   { lifetime: Lifetime.SINGLETON }),
		productRepository: asClass(ProductRepository, { lifetime: Lifetime.SINGLETON }),
		sessionStore:      asClass(SessionStore,      { lifetime: Lifetime.SCOPED }),

		// services
		tokenService:        asFunction(makeTokenService,   { lifetime: Lifetime.SINGLETON }),
		passwordHasher:      asFunction(makePasswordHasher, { lifetime: Lifetime.TRANSIENT }),
		authService:         asClass(AuthService,         { lifetime: Lifetime.SINGLETON }),
		orderService:        asClass(OrderService,        { lifetime: Lifetime.SINGLETON }),
		cacheService:        asClass(CacheService,        { lifetime: Lifetime.SINGLETON }),
		productService:      asClass(ProductService,      { lifetime: Lifetime.SCOPED }),
		notificationService: asClass(NotificationService, { lifetime: Lifetime.SINGLETON }),

		// controllers
		userController:  asClass(UserController,  { lifetime: Lifetime.TRANSIENT }),
		orderController: asClass(OrderController, { lifetime: Lifetime.TRANSIENT }),

		// aliases
		auth: aliasTo('authService'),
		log:  aliasTo('logger'),
	});
	return c;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Large complex container — inspection & graph', () => {
	let graph: DependencyGraph;

	beforeAll(() => {
		const container = buildComplexContainer();
		const nodes = inspectContainer(container);
		graph = buildGraph(nodes);
	});

	// ── Node detection ──────────────────────────────────────────────────────

	it('detects all registered nodes', () => {
		const names = new Set(graph.nodes.map((n) => n.name));
		const expected = [
			'appConfig', 'dbConfig', 'redisConfig',
			'logger', 'database', 'redisClient', 'httpClient', 'mailer',
			'userRepository', 'orderRepository', 'productRepository', 'sessionStore',
			'tokenService', 'passwordHasher', 'authService', 'orderService',
			'cacheService', 'productService', 'notificationService',
			'userController', 'orderController',
			'auth', 'log',
		];
		for (const name of expected) expect(names).toContain(name);
	});

	it('marks smtpClient as a missing node', () => {
		const node = graph.nodes.find((n) => n.name === 'smtpClient');
		expect(node?.missing).toBe(true);
		expect(node?.type).toBe('unknown');
	});

	it('does not mark registered nodes as missing', () => {
		const registered = graph.nodes.filter(
			(n) => n.name !== 'smtpClient' && !n.missing
		);
		expect(registered.length).toBeGreaterThan(0);
		expect(graph.nodes.every((n) => n.missing === (n.name === 'smtpClient'))).toBe(true);
	});

	it('classifies node types correctly', () => {
		const byName = Object.fromEntries(graph.nodes.map((n) => [n.name, n.type]));
		expect(byName.appConfig).toBe('value');
		expect(byName.dbConfig).toBe('value');
		expect(byName.logger).toBe('class');
		expect(byName.database).toBe('class');
		expect(byName.mailer).toBe('class');
		expect(byName.userRepository).toBe('class');
		expect(byName.tokenService).toBe('function');
		expect(byName.passwordHasher).toBe('function');
		expect(byName.auth).toBe('alias');
		expect(byName.log).toBe('alias');
	});

	it('classifies lifetimes correctly', () => {
		const byName = Object.fromEntries(graph.nodes.map((n) => [n.name, n.lifetime]));
		expect(byName.logger).toBe('SINGLETON');
		expect(byName.database).toBe('SINGLETON');
		expect(byName.httpClient).toBe('TRANSIENT');
		expect(byName.passwordHasher).toBe('TRANSIENT');
		expect(byName.sessionStore).toBe('SCOPED');
		expect(byName.productService).toBe('SCOPED');
		expect(byName.userController).toBe('TRANSIENT');
		expect(byName.appConfig).toBeUndefined();  // value — no lifetime
		expect(byName.auth).toBeUndefined();        // alias — no lifetime
	});

	// ── Edge correctness ────────────────────────────────────────────────────

	it('builds correct edges for infrastructure nodes', () => {
		const edgeSet = new Set(graph.edges.map((e) => `${e.from}->${e.to}`));
		expect(edgeSet.has('database->dbConfig')).toBe(true);
		expect(edgeSet.has('database->logger')).toBe(true);
		expect(edgeSet.has('redisClient->redisConfig')).toBe(true);
		expect(edgeSet.has('redisClient->logger')).toBe(true);
		expect(edgeSet.has('httpClient->logger')).toBe(true);
		expect(edgeSet.has('httpClient->appConfig')).toBe(true);
		expect(edgeSet.has('mailer->smtpClient')).toBe(true);
		expect(edgeSet.has('mailer->logger')).toBe(true);
	});

	it('builds correct edges for services', () => {
		const edgeSet = new Set(graph.edges.map((e) => `${e.from}->${e.to}`));
		expect(edgeSet.has('authService->userRepository')).toBe(true);
		expect(edgeSet.has('authService->tokenService')).toBe(true);
		expect(edgeSet.has('authService->passwordHasher')).toBe(true);
		expect(edgeSet.has('orderService->orderRepository')).toBe(true);
		expect(edgeSet.has('orderService->mailer')).toBe(true);
		expect(edgeSet.has('productService->productRepository')).toBe(true);
		expect(edgeSet.has('productService->cacheService')).toBe(true);
		expect(edgeSet.has('productService->httpClient')).toBe(true);
		expect(edgeSet.has('notificationService->mailer')).toBe(true);
		expect(edgeSet.has('notificationService->logger')).toBe(true);
	});

	it('builds correct edges for aliases', () => {
		const edgeSet = new Set(graph.edges.map((e) => `${e.from}->${e.to}`));
		expect(edgeSet.has('auth->authService')).toBe(true);
		expect(edgeSet.has('log->logger')).toBe(true);
	});

	it('builds correct edges for controllers', () => {
		const edgeSet = new Set(graph.edges.map((e) => `${e.from}->${e.to}`));
		expect(edgeSet.has('userController->authService')).toBe(true);
		expect(edgeSet.has('userController->userRepository')).toBe(true);
		expect(edgeSet.has('orderController->orderService')).toBe(true);
		expect(edgeSet.has('orderController->authService')).toBe(true);
		expect(edgeSet.has('orderController->sessionStore')).toBe(true);
	});

	it('has no duplicate edges', () => {
		const ids = graph.edges.map((e) => `${e.from}|${e.to}`);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('detects no cycles', () => {
		expect(graph.cycles).toHaveLength(0);
	});

	// ── Lifetime violations ─────────────────────────────────────────────────

	it('detects SINGLETON→TRANSIENT error (authService→passwordHasher)', () => {
		const v = graph.violations?.find(
			(x) => x.from === 'authService' && x.to === 'passwordHasher'
		);
		expect(v).toBeDefined();
		expect(v?.severity).toBe('error');
		expect(v?.fromLifetime).toBe('SINGLETON');
		expect(v?.toLifetime).toBe('TRANSIENT');
	});

	it('detects SCOPED→TRANSIENT warning (productService→httpClient)', () => {
		const v = graph.violations?.find(
			(x) => x.from === 'productService' && x.to === 'httpClient'
		);
		expect(v).toBeDefined();
		expect(v?.severity).toBe('warning');
		expect(v?.fromLifetime).toBe('SCOPED');
		expect(v?.toLifetime).toBe('TRANSIENT');
	});

	it('reports exactly 2 violations', () => {
		expect(graph.violations).toHaveLength(2);
	});

	it('has one error-severity and one warning-severity violation', () => {
		const errors   = graph.violations?.filter((v) => v.severity === 'error')   ?? [];
		const warnings = graph.violations?.filter((v) => v.severity === 'warning') ?? [];
		expect(errors).toHaveLength(1);
		expect(warnings).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Large complex container — format rendering', () => {
	let graph: DependencyGraph;

	beforeAll(() => {
		const container = buildComplexContainer();
		graph = buildGraph(inspectContainer(container));
	});

	it('renders valid Mermaid output', () => {
		const out = renderGraph(graph, 'mermaid');
		expect(out).toMatch(/^graph (LR|TD)/);
		expect(out).toContain('authService');
		expect(out).toContain('smtpClient');
	});

	it('renders valid DOT output', () => {
		const out = renderGraph(graph, 'dot');
		expect(out).toMatch(/^digraph AwilixDependencies/);
		expect(out).toContain('"database"');
		expect(out).toContain('"smtpClient"');
	});

	it('renders valid JSON with all nodes and edges', () => {
		const out  = renderGraph(graph, 'json');
		const data = JSON.parse(out);
		expect(data.nodes.length).toBe(graph.nodes.length);
		expect(data.edges.length).toBe(graph.edges.length);
		expect(data.cycles).toEqual([]);
		expect(data.violations).toHaveLength(2);
	});

	it('renders valid self-contained HTML', () => {
		const out = renderGraph(graph, 'html');
		expect(out).toMatch(/^<!DOCTYPE html>/i);
		expect(out).toContain('vis-network');
		expect(out).toContain('new vis.Network(');
		expect(out).toContain('authService');
	});

	it('HTML embedded GRAPH JSON has no duplicate node or edge IDs', () => {
		const html = renderGraph(graph, 'html');
		const marker = 'var GRAPH = ';
		const start  = html.indexOf(marker) + marker.length;
		const rawLine = html.slice(start, html.indexOf('\n', start)).trimEnd().replace(/;$/, '');
		const data = JSON.parse(rawLine);

		const nodeIds = (data.nodes as { name: string }[]).map((n) => n.name);
		expect(new Set(nodeIds).size).toBe(nodeIds.length);

		const edgeIds = (data.edges as { from: string; to: string }[])
			.map((e) => `${e.from}|${e.to}`);
		expect(new Set(edgeIds).size).toBe(edgeIds.length);
	});

	it('HTML violation section lists the two violations', () => {
		const html = renderGraph(graph, 'html');
		expect(html).toContain('Lifetime Violations');
		expect(html).toContain('authService');
		expect(html).toContain('passwordHasher');
		expect(html).toContain('productService');
		expect(html).toContain('httpClient');
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Large complex container — focus subgraph', () => {
	let graph: DependencyGraph;

	beforeAll(() => {
		const container = buildComplexContainer();
		graph = buildGraph(inspectContainer(container));
	});

	it('focusSubgraph on authService (depth 1) contains direct neighbours only', () => {
		const sub = focusSubgraph(graph, 'authService', 1);
		const names = new Set(sub.nodes.map((n) => n.name));
		// authService itself
		expect(names.has('authService')).toBe(true);
		// direct deps
		expect(names.has('userRepository')).toBe(true);
		expect(names.has('tokenService')).toBe(true);
		expect(names.has('passwordHasher')).toBe(true);
		// nodes that depend on authService (depth 1 upstream)
		expect(names.has('userController')).toBe(true);
		expect(names.has('orderController')).toBe(true);
		expect(names.has('auth')).toBe(true);   // alias
		// nodes 2+ hops away must be absent
		expect(names.has('database')).toBe(false);
		expect(names.has('dbConfig')).toBe(false);
		expect(names.has('productService')).toBe(false);
	});

	it('focusSubgraph on authService (unlimited depth) reaches leaf nodes', () => {
		const sub = focusSubgraph(graph, 'authService');
		const names = new Set(sub.nodes.map((n) => n.name));
		expect(names.has('database')).toBe(true);
		expect(names.has('dbConfig')).toBe(true);
		expect(names.has('logger')).toBe(true);
	});

	it('focusSubgraph on authService has no duplicate edges', () => {
		const sub = focusSubgraph(graph, 'authService');
		const ids = sub.edges.map((e) => `${e.from}|${e.to}`);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('focusSubgraph does not carry violations (violations live on the full graph)', () => {
		// focusSubgraph returns { nodes, edges, cycles } — violations are not sliced.
		// Callers needing violations on a subgraph should call detectViolations on the result.
		const sub = focusSubgraph(graph, 'authService');
		expect(sub.violations).toBeUndefined();
		// The full graph still has them
		expect(graph.violations?.length).toBeGreaterThan(0);
	});

	it('focusSubgraph on a leaf node (logger) returns a small subgraph', () => {
		const sub = focusSubgraph(graph, 'logger', 1);
		const names = new Set(sub.nodes.map((n) => n.name));
		expect(names.has('logger')).toBe(true);
		// logger has no deps, so depth-1 downstream is empty
		// but many nodes depend on logger upstream
		expect(names.has('database')).toBe(true);
		expect(names.has('userRepository')).toBe(true);
	});

	it('throws for an unknown focus name', () => {
		expect(() => focusSubgraph(graph, 'doesNotExist')).toThrow('"doesNotExist"');
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Error nodes from broken resolvers', () => {
	function makeBrokenResolver(message: string): Record<string, unknown> {
		const r: Record<string, unknown> = { resolve: () => null };
		Object.defineProperty(r, 'inject', {
			enumerable: true,
			configurable: true,
			get() { throw new Error(message); },
		});
		return r;
	}

	it('classifies a broken resolver as type "error"', () => {
		const nodes = inspectContainer({
			registrations: { brokenService: makeBrokenResolver('probe failed') },
		});
		const node = nodes.find((n) => n.name === 'brokenService');
		expect(node?.type).toBe('error');
		expect(node?.error).toBe('probe failed');
		expect(node?.dependencies).toEqual([]);
		expect(node?.missing).toBe(false);
	});

	it('error node is included in the built graph', () => {
		const nodes = inspectContainer({
			registrations: { brokenService: makeBrokenResolver('boom') },
		});
		const graph = buildGraph(nodes);
		expect(graph.nodes.find((n) => n.name === 'brokenService')).toBeDefined();
	});

	it('error node produces no edges in the graph', () => {
		const nodes = inspectContainer({
			registrations: { brokenService: makeBrokenResolver('boom') },
		});
		const graph = buildGraph(nodes);
		const touching = graph.edges.filter(
			(e) => e.from === 'brokenService' || e.to === 'brokenService'
		);
		expect(touching).toHaveLength(0);
	});

	it('multiple broken resolvers are each captured independently', () => {
		const nodes = inspectContainer({
			registrations: {
				broken1: makeBrokenResolver('err one'),
				broken2: makeBrokenResolver('err two'),
			},
		});
		const b1 = nodes.find((n) => n.name === 'broken1');
		const b2 = nodes.find((n) => n.name === 'broken2');
		expect(b1?.error).toBe('err one');
		expect(b2?.error).toBe('err two');
	});

	it('all formats render without throwing even when error nodes are present', () => {
		const nodes = inspectContainer({
			registrations: { brokenService: makeBrokenResolver('boom') },
		});
		const graph = buildGraph(nodes);
		for (const fmt of ['mermaid', 'dot', 'json', 'html'] as OutputFormat[]) {
			expect(() => renderGraph(graph, fmt), `format=${fmt}`).not.toThrow();
		}
	});

	it('mixed container: error node alongside valid nodes renders correctly', () => {
		// Spread awilix registrations into a plain object so we can add the broken resolver.
		// Mutating container.registrations directly is not reliable (awilix uses a getter).
		const mockContainer = {
			registrations: {
				...buildComplexContainer().registrations,
				crasher: makeBrokenResolver('intentional crash'),
			},
		};
		const nodes = inspectContainer(mockContainer);
		const graph = buildGraph(nodes);

		expect(graph.nodes.find((n) => n.name === 'crasher')?.type).toBe('error');
		// The rest of the graph must still be intact
		expect(graph.nodes.find((n) => n.name === 'authService')?.type).toBe('class');
		// All formats must not throw
		for (const fmt of ['mermaid', 'dot', 'json', 'html'] as OutputFormat[]) {
			expect(() => renderGraph(graph, fmt), `format=${fmt}`).not.toThrow();
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Duplicate dependency deduplication', () => {
	function node(name: string, deps: string[] = []): GraphNode {
		return { name, type: 'class', dependencies: deps, missing: false };
	}

	it('deduplicates edges when node.dependencies has repeated names', () => {
		const graph = buildGraph([
			node('svc', ['logger', 'logger']),
			node('logger'),
		]);
		const fromSvc = graph.edges.filter((e) => e.from === 'svc');
		expect(fromSvc).toHaveLength(1);
		expect(fromSvc[0].to).toBe('logger');
	});

	it('does not alter node.dependencies — only edges are deduplicated', () => {
		const input = node('svc', ['dep', 'dep', 'dep']);
		buildGraph([input, node('dep')]);
		// The original node object must not be mutated
		expect(input.dependencies).toHaveLength(3);
	});

	it('handles a node that lists many different deps with one duplicate', () => {
		const graph = buildGraph([
			node('svc', ['a', 'b', 'c', 'a']),
			node('a'), node('b'), node('c'),
		]);
		const fromSvc = graph.edges.filter((e) => e.from === 'svc');
		const toNames = fromSvc.map((e) => e.to).sort();
		expect(toNames).toEqual(['a', 'b', 'c']);
	});

	it('HTML vis.js DataSet receives no duplicate edge IDs (regression for "id already exists")', () => {
		const dupNode: GraphNode = {
			name: 'networkService',
			type: 'class',
			dependencies: ['logger', 'logger'],
			missing: false,
		};
		const graph = buildGraph([dupNode, { name: 'logger', type: 'class', dependencies: [], missing: false }]);

		// Primary assertion: no duplicate edges in the graph data
		const edgeIds = graph.edges.map((e) => `${e.from}|${e.to}`);
		expect(new Set(edgeIds).size).toBe(edgeIds.length);

		// Secondary: the GRAPH JSON embedded in HTML must also have unique edge IDs
		const html  = renderGraph(graph, 'html');
		const marker = 'var GRAPH = ';
		const start  = html.indexOf(marker) + marker.length;
		const rawLine = html.slice(start, html.indexOf('\n', start)).trimEnd().replace(/;$/, '');
		const data  = JSON.parse(rawLine);
		const htmlEdgeIds = (data.edges as { from: string; to: string }[])
			.map((e) => `${e.from}|${e.to}`);
		expect(new Set(htmlEdgeIds).size).toBe(htmlEdgeIds.length);
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Graph with cycles — format rendering', () => {
	function node(name: string, deps: string[] = []): GraphNode {
		return { name, type: 'class', dependencies: deps, missing: false };
	}

	it('all formats render without throwing when cycles are present', () => {
		const graph = buildGraph([
			node('a', ['b']),
			node('b', ['c']),
			node('c', ['a']),
			node('d', ['a', 'b']),
		]);
		expect(graph.cycles.length).toBeGreaterThan(0);
		for (const fmt of ['mermaid', 'dot', 'json', 'html'] as OutputFormat[]) {
			expect(() => renderGraph(graph, fmt), `format=${fmt}`).not.toThrow();
		}
	});

	it('GRAPH data embedded in HTML carries cycle info when cycles are present', () => {
		// The HTML template uses a JS variable `cyclesPresent` (not a literal), so we
		// verify the embedded GRAPH JSON has cycles — vis.js will enable physics at runtime.
		const graph = buildGraph([node('a', ['b']), node('b', ['a'])]);
		const html = renderGraph(graph, 'html');
		const marker = 'var GRAPH = ';
		const start = html.indexOf(marker) + marker.length;
		const rawLine = html.slice(start, html.indexOf('\n', start)).trimEnd().replace(/;$/, '');
		const data = JSON.parse(rawLine);
		expect(data.cycles.length).toBeGreaterThan(0);
	});

	it('cycle list appears in the HTML output', () => {
		const graph = buildGraph([node('x', ['y']), node('y', ['x'])]);
		const html = renderGraph(graph, 'html');
		expect(html).toContain('Cycles');
	});
});
