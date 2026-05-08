// Public utility: parse dependency names directly from a function or class.
// Supports: PROXY mode (destructured first arg), CLASSIC mode (positional args),
// and explicit injection via the RESOLVER symbol.
//
// NOTE: this module is NOT used internally by inspectContainer. awilix v10+ resolvers
// do not expose the underlying function (no .fn property), so we cannot pass it here.
// inspectContainer uses a runtime spy approach instead (see inspect.ts).

const STRIP_COMMENTS = /\/\*[\s\S]*?\*\/|\/\/.*/g;

// Lazy-load the RESOLVER symbol so this module works even without awilix installed
// (useful when running via the library API with a pre-built container).
let RESOLVER_SYM: symbol | undefined;
try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	RESOLVER_SYM = require('awilix').RESOLVER;
} catch {
	// awilix not available at this path — RESOLVER-based injection won't be detected
}

// biome-ignore lint/complexity/noBannedTypes: fn can be any callable — class or arrow or regular function
export function parseDependencies(fn: Function): string[] {
	if (RESOLVER_SYM) {
		const explicit = readResolverSymbol(fn, RESOLVER_SYM);
		if (explicit !== null) return explicit;
	}
	const src = fn.toString().replace(STRIP_COMMENTS, '');
	return parseFromSource(src);
}

// biome-ignore lint/complexity/noBannedTypes: same as above
function readResolverSymbol(fn: Function, sym: symbol): string[] | null {
	const config = (fn as unknown as Record<symbol, unknown>)[sym];
	if (!config || typeof config !== 'object') return null;
	const { inject } = config as { inject?: unknown };
	if (!inject) return null;
	const resolved =
		typeof inject === 'function' ? (inject as () => unknown)() : inject;
	if (Array.isArray(resolved)) {
		return resolved.filter((i): i is string => typeof i === 'string');
	}
	return null;
}

function parseFromSource(src: string): string[] {
	src = src.trim();

	// ES6 class — find constructor signature
	if (src.startsWith('class')) {
		const ctorMatch = src.match(/\bconstructor\s*\(([^)]*)\)/);
		return ctorMatch ? parseParamStr(ctorMatch[1]) : [];
	}

	// Regular named/anonymous function
	if (src.startsWith('function') || src.startsWith('async function')) {
		const match = src.match(/^(?:async\s+)?function\s*\w*\s*\(([^)]*)\)/);
		return match ? parseParamStr(match[1]) : [];
	}

	// Arrow function (possibly async): (params) => ... or async (params) => ...
	if (src.startsWith('(') || src.startsWith('async')) {
		const match = src.match(/^(?:async\s+)?\(([^)]*)\)/);
		return match ? parseParamStr(match[1]) : [];
	}

	// Single-param arrow without parentheses: x => ...
	const singleArrow = src.match(/^(\w+)\s*=>/);
	if (singleArrow) return [singleArrow[1]];

	// Fallback: grab the first parameter list found
	const fallback = src.match(/\(([^)]*)\)/);
	return fallback ? parseParamStr(fallback[1]) : [];
}

function parseParamStr(paramStr: string): string[] {
	paramStr = paramStr.trim();
	if (!paramStr) return [];

	// Destructured first arg: { dep1, dep2, dep3: alias }  — the Awilix PROXY default
	if (paramStr.startsWith('{')) {
		const closingBrace = findClosingBrace(paramStr, 0);
		const inner = paramStr.slice(1, closingBrace);
		return extractDestructuredKeys(inner);
	}

	// Positional params: dep1, dep2 = default, ...rest
	return paramStr
		.split(',')
		.map((p) =>
			p
				.trim()
				.replace(/\s*=[\s\S]*$/, '')
				.replace(/^\.\.\./, '')
				.trim()
		)
		.filter(Boolean);
}

function findClosingBrace(src: string, openAt: number): number {
	let depth = 0;
	for (let i = openAt; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return src.length;
}

function extractDestructuredKeys(inner: string): string[] {
	const keys: string[] = [];
	let depth = 0;
	let current = '';

	for (const ch of `${inner},`) {
		if (ch === '{' || ch === '[') {
			depth++;
			continue;
		}
		if (ch === '}' || ch === ']') {
			depth--;
			continue;
		}
		if (depth > 0) continue;

		if (ch === ',') {
			// Each segment is like: key, key: alias, key = default, key: alias = default, ...rest
			const raw = current.trim();
			if (!raw.startsWith('...')) {
				// rest spread (...rest) is not a named dependency — skip it
				const key = raw.split(/[=:]/)[0].trim();
				if (key) keys.push(key);
			}
			current = '';
		} else {
			current += ch;
		}
	}

	return keys.filter((k) => k && /^\w+$/.test(k));
}
