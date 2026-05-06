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
 * Works by probing each resolver with two spy containers:
 *  - CLASSIC-mode spy  → intercepts container.resolve(name) calls to collect dep names
 *  - PROXY-mode spy    → examines the resolved value's prototype to detect class vs function
 *
 * This approach is version-agnostic: it does not rely on resolver internals like `.fn`.
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
	name: string
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

	const dependencies = collectDepsClassicSpy(resolver, name);
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

// Force CLASSIC injection mode so the resolver calls container.resolve(name) for each dep.
// We intercept those calls to build the dependency list.
function collectDepsClassicSpy(resolver: AnyResolver, _name: string): string[] {
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
