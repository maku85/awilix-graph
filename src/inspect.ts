import type { GraphNode, Lifetime, NodeType } from './types';

interface AnyResolver {
	resolve: (...args: unknown[]) => unknown;
	inject?: unknown;
	[key: string]: unknown;
}

interface AwilixContainer {
	registrations: Record<string, unknown>;
}

/**
 * Inspect an Awilix container and return a list of nodes with their types and dependencies.
 *
 * Works by probing each resolver with spy containers. awilix v10+ does not expose `.fn`,
 * so we cannot use static analysis and must rely on runtime probing:
 *
 *  - PROXY recording-cradle spy (primary): runs the resolver in PROXY mode with a cradle
 *    that records which service names are accessed. Correctly handles both destructuring
 *    `({ db, cache }) => {}` and named-container `(container) => { container.db }` patterns.
 *
 *  - CLASSIC-mode spy (fallback): intercepts container.resolve(name) calls. Used when the
 *    PROXY spy collects nothing (e.g. resolvers explicitly set to CLASSIC injection mode, or
 *    zero-dep factories). Also used for aliasTo detection.
 *
 *  - PROXY prototype spy: examines the resolved value's prototype to detect class vs function.
 *
 * Note: both spy approaches execute the factory/constructor body as a side effect. The PROXY
 * spy uses makeSpy() (a recursive proxy that absorbs all operations) for dep values, which
 * minimises observable side effects compared to passing `undefined`.
 */
export function inspectContainer(container: AwilixContainer): GraphNode[] {
	const registrations = container.registrations;
	if (!registrations || typeof registrations !== 'object') {
		throw new Error(
			'The provided object does not look like an Awilix container (missing .registrations)'
		);
	}

	return Object.entries(registrations).map(([name, resolver]) => {
		try {
			const { type, dependencies } = probeResolver(
				resolver as AnyResolver,
				name
			);
			const lifetime = extractLifetime(resolver as AnyResolver);
			return { name, type, dependencies, missing: false, lifetime };
		} catch (err) {
			return {
				name,
				type: 'error',
				dependencies: [],
				missing: false,
				lifetime: undefined,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	});
}

function extractLifetime(resolver: AnyResolver): Lifetime | undefined {
	const lt = resolver.lifetime;
	if (lt === 'SINGLETON' || lt === 'TRANSIENT' || lt === 'SCOPED') return lt;
	return undefined;
}

function probeResolver(
	resolver: AnyResolver,
	_name: string
): { type: NodeType; dependencies: string[] } {
	// asValue / aliasTo resolvers have no builder methods like .inject, .transient, etc.
	if (!('inject' in resolver) || typeof resolver.inject !== 'function') {
		// aliasTo calls container.resolve(target) exactly once when resolved.
		// asValue just returns a static value and never touches the container.
		const aliasTarget = detectAliasTarget(resolver);
		if (aliasTarget !== null) {
			return { type: 'alias', dependencies: [aliasTarget] };
		}
		return { type: 'value', dependencies: [] };
	}

	const dependencies = collectDeps(resolver);
	const type = detectTypePrxySpy(resolver);

	return { type, dependencies };
}

// aliasTo resolvers call container.resolve(targetName) once during resolution.
function detectAliasTarget(resolver: AnyResolver): string | null {
	const calls: string[] = [];
	const mockContainer = {
		resolve(name: string) {
			calls.push(name);
			return undefined;
		},
		options: { injectionMode: 'PROXY' },
		cradle: {},
	};
	try {
		resolver.resolve.call({}, mockContainer);
	} catch {
		// ignore
	}
	return calls.length === 1 ? calls[0] : null;
}

// Primary: run the resolver in PROXY mode with a recording cradle.
// Records which service names are accessed at the top level of the cradle, covering both
// destructuring `({ db, cache }) => {}` and named-container `(c) => { c.db }` patterns.
// Falls back to the CLASSIC spy when the PROXY spy collects nothing (explicit CLASSIC-mode
// resolvers, or zero-dep factories).
function collectDeps(resolver: AnyResolver): string[] {
	const proxyDeps = collectDepsProxySpy(resolver);
	if (proxyDeps.length > 0) return proxyDeps;
	return collectDepsClassicSpy(resolver);
}

// PROXY recording-cradle spy: any top-level property access on the cradle is a dep name.
// Uses makeSpy() for resolved values so the factory/constructor can complete without errors.
// Properties used internally by JS (Symbol.*) and well-known non-dep names are ignored.
const CRADLE_SKIP = new Set([
	'then',
	'catch',
	'finally',
	'toJSON',
	'inspect',
	'constructor',
	'__esModule',
]);

function collectDepsProxySpy(resolver: AnyResolver): string[] {
	const accessed = new Set<string>();
	const spy = makeSpy();
	const recordingCradle = new Proxy(Object.create(null) as object, {
		get(_: object, prop: string | symbol) {
			if (typeof prop === 'string' && !CRADLE_SKIP.has(prop)) {
				accessed.add(prop);
			}
			return spy;
		},
	});
	const mockCtx = { injectionMode: null, injector: null };
	const mockContainer = {
		options: { injectionMode: 'PROXY' },
		cradle: recordingCradle,
		resolve: () => spy,
	};
	try {
		resolver.resolve.call(mockCtx, mockContainer);
	} catch {
		// Factory may throw when operating on spy values — deps already recorded.
	}
	return [...accessed];
}

// Fallback: force CLASSIC injection mode so the resolver calls container.resolve(name) for
// each dep. We intercept those calls to build the dependency list.
function collectDepsClassicSpy(resolver: AnyResolver): string[] {
	const deps: string[] = [];
	const mockCtx = { injectionMode: 'CLASSIC' as const, injector: null };
	const mockContainer = {
		options: { injectionMode: 'CLASSIC' },
		resolve(depName: string) {
			deps.push(depName);
			return undefined;
		},
		cradle: {},
	};
	try {
		resolver.resolve.call(mockCtx, mockContainer);
	} catch {
		// Expected: fn() will be called with undefined args and may throw on destructure.
		// Dependencies are already collected before fn() is invoked.
	}
	return deps;
}

// Use PROXY mode with a spy cradle. Examine the returned value's prototype
// to decide whether the resolver wraps a class or a plain factory function.
function detectTypePrxySpy(resolver: AnyResolver): NodeType {
	const spy = makeSpy();
	const mockContainer = {
		options: { injectionMode: 'PROXY' },
		cradle: spy,
		resolve: () => spy,
	};
	try {
		const result = resolver.resolve.call(
			{ injectionMode: null, injector: null },
			mockContainer
		);
		if (result !== null && typeof result === 'object') {
			const proto = Object.getPrototypeOf(result) as {
				constructor?: ((...args: unknown[]) => unknown) & {
					toString(): string;
				};
			} | null;
			const ctor = proto?.constructor;
			if (ctor && ctor !== Object && typeof ctor === 'function') {
				const src = ctor.toString();
				if (/^\s*class[\s{]/.test(src)) return 'class';
			}
		}
		return 'function';
	} catch {
		return 'unknown';
	}
}

// A recursive proxy that acts as an object, a function, and a constructor —
// returning itself for any interaction so factory bodies don't throw.
function makeSpy(): object {
	const handler: ProxyHandler<object> = {
		get(_, p) {
			if (p === Symbol.toPrimitive) return () => 0;
			if (p === Symbol.iterator) return function* () {};
			return spy;
		},
		apply: () => spy,
		construct: () => spy as object,
	};
	const spy = new Proxy(() => {}, handler);
	return spy;
}
