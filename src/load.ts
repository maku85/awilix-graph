import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

interface AwilixContainer {
	registrations: Record<string, unknown>;
}

// ── ESM detection ─────────────────────────────────────────────────────────────

/**
 * Walk up the directory tree and return the nearest package.json `type` field.
 * Returns `'commonjs'` if no package.json is found (Node default).
 */
function nearestPkgType(dir: string): string {
	const pkgPath = path.join(dir, 'package.json');
	if (fs.existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
				type?: string;
			};
			return pkg.type ?? 'commonjs';
		} catch {
			/* malformed — keep walking */
		}
	}
	const parent = path.dirname(dir);
	if (parent === dir) return 'commonjs';
	return nearestPkgType(parent);
}

/**
 * Return true when `absPath` must be treated as an ES module:
 *  - `.mjs` / `.mts` → always ESM
 *  - `.cjs` / `.cts` → always CJS
 *  - `.js` / `.ts`   → check nearest package.json `"type": "module"`
 */
export function isEsmFile(absPath: string): boolean {
	const ext = path.extname(absPath).toLowerCase();
	if (ext === '.mjs' || ext === '.mts') return true;
	if (ext === '.cjs' || ext === '.cts') return false;
	return nearestPkgType(path.dirname(absPath)) === 'module';
}

// ── TypeScript loader registration ────────────────────────────────────────────

// Guard against double-registration across multiple loadContainer() calls.
let tsLoaderState: 'none' | 'cjs' | 'esm' = 'none';

function registerTsCjs(): void {
	if (tsLoaderState !== 'none') return;

	// Prefer tsx (handles modern TS syntax, ESM-style imports in CJS output)
	try {
		const api = require('tsx/cjs/api') as { register(): () => void };
		api.register();
		tsLoaderState = 'cjs';
		return;
	} catch {
		/* tsx not installed */
	}

	// Fall back to ts-node
	try {
		require('ts-node').register({
			transpileOnly: true,
			compilerOptions: { module: 'commonjs' },
		});
		tsLoaderState = 'cjs';
	} catch {
		throw new Error(
			'Loading TypeScript container files requires "tsx" or "ts-node".\n' +
				'Install one: pnpm add -D tsx'
		);
	}
}

function registerTsEsm(): void {
	if (tsLoaderState !== 'none') return;

	// Uses Node.js module customization hooks (requires Node 18.19+).
	// tsx must be installed; it is resolved from the project that contains the
	// container file, so it does not need to be a dep of awilix-graph itself.
	try {
		const { register } = require('node:module') as typeof import('node:module');
		// Pass the CWD as base URL so Node resolves 'tsx/esm' from the project root.
		register('tsx/esm', pathToFileURL(`${process.cwd()}/`));
		tsLoaderState = 'esm';
	} catch {
		throw new Error(
			'Loading ESM TypeScript container files requires "tsx" (Node.js 18.19+).\n' +
				'Install: pnpm add -D tsx'
		);
	}
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function loadContainer(
	containerPath: string
): Promise<AwilixContainer> {
	const absPath = path.resolve(process.cwd(), containerPath);

	if (!fs.existsSync(absPath)) {
		throw new Error(`Container file not found: ${absPath}`);
	}

	const ext = path.extname(absPath).toLowerCase();
	const esm = isEsmFile(absPath);
	const isTs = ext === '.ts' || ext === '.mts' || ext === '.cts';

	// Register a TypeScript transform hook before the first load.
	if (isTs) {
		if (esm) {
			registerTsEsm();
		} else {
			registerTsCjs();
		}
	}

	const mod: unknown = esm
		? await import(pathToFileURL(absPath).href)
		: require(absPath);

	return resolveContainerExport(mod, absPath);
}

// ── Export resolution ─────────────────────────────────────────────────────────

async function resolveContainerExport(
	mod: unknown,
	filePath: string
): Promise<AwilixContainer> {
	// Unwrap ESM namespace or TypeScript __esModule interop wrapper.
	// When a CJS module is loaded via dynamic import(), it arrives as
	// { default: <module.exports> }, so checking for 'default' covers both cases.
	let candidate: unknown = mod;
	if (mod !== null && typeof mod === 'object') {
		const m = mod as Record<string, unknown>;
		if ('default' in m || '__esModule' in m) {
			candidate = m.default;
		}
	}

	// Named export: { container }
	if (
		candidate !== null &&
		typeof candidate === 'object' &&
		!isContainer(candidate)
	) {
		const named = (candidate as Record<string, unknown>).container;
		if (named !== undefined) candidate = named;
	}

	// Factory function (sync or async)
	if (typeof candidate === 'function') {
		candidate = await (candidate as () => unknown)();
	}

	if (!isContainer(candidate)) {
		throw new Error(
			`Could not find an Awilix container in "${filePath}".\n` +
				'The file should export the container directly, as { container }, or as a factory function.'
		);
	}

	return candidate as AwilixContainer;
}

function isContainer(val: unknown): boolean {
	return (
		val !== null &&
		typeof val === 'object' &&
		'registrations' in val &&
		typeof (val as Record<string, unknown>).registrations === 'object'
	);
}
