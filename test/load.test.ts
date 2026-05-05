import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEsmFile, loadContainer } from '../src/load';

const fix = (...parts: string[]) =>
	path.join(__dirname, 'fixtures', ...parts);

// ── isEsmFile ─────────────────────────────────────────────────────────────────

describe('isEsmFile', () => {
	it('.mjs → true', () => expect(isEsmFile('/any/file.mjs')).toBe(true));
	it('.mts → true', () => expect(isEsmFile('/any/file.mts')).toBe(true));
	it('.cjs → false', () => expect(isEsmFile('/any/file.cjs')).toBe(false));
	it('.cts → false', () => expect(isEsmFile('/any/file.cts')).toBe(false));

	it('.js in CJS package → false', () => {
		// test/fixtures/ has no package.json → walks up to repo root which has no "type"
		expect(isEsmFile(fix('container.cjs').replace('.cjs', '.js'))).toBe(false);
	});

	it('.js in ESM package → true (nearest package.json has "type":"module")', () => {
		expect(isEsmFile(fix('esm-pkg', 'container.js'))).toBe(true);
	});
});

// ── loadContainer — CJS ───────────────────────────────────────────────────────

describe('loadContainer — CJS (.cjs)', () => {
	it('loads an explicit .cjs container', async () => {
		const c = await loadContainer(fix('container.cjs'));
		expect(c.registrations).toHaveProperty('mode');
	});

	it('throws for a missing file', async () => {
		await expect(loadContainer('/does/not/exist.cjs')).rejects.toThrow(
			'Container file not found'
		);
	});

	it('throws when the export is not a container', async () => {
		await expect(loadContainer(fix('not-a-container.mjs'))).rejects.toThrow(
			'Could not find an Awilix container'
		);
	});
});

// ── loadContainer — ESM (.mjs) ────────────────────────────────────────────────

describe('loadContainer — ESM (.mjs)', () => {
	it('loads a default-export container', async () => {
		const c = await loadContainer(fix('container.mjs'));
		expect(c.registrations).toHaveProperty('mode');
	});

	it('loads a named { container } export', async () => {
		const c = await loadContainer(fix('container-named.mjs'));
		expect(c.registrations).toHaveProperty('mode');
	});

	it('loads an async factory function export', async () => {
		const c = await loadContainer(fix('container-factory.mjs'));
		expect(c.registrations).toHaveProperty('mode');
	});
});

// ── loadContainer — JS in ESM package ────────────────────────────────────────

describe('loadContainer — .js in ESM package', () => {
	it('detects ESM via package.json and loads correctly', async () => {
		const c = await loadContainer(fix('esm-pkg', 'container.js'));
		expect(c.registrations).toHaveProperty('mode');
	});
});
