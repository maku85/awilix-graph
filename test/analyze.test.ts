import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeContainerFile } from '../src/analyze';

const EXAMPLE = path.join(__dirname, '../examples/container.js');

describe('analyzeContainerFile — examples/container.js', () => {
	it('detects all registered nodes', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		const names = nodes.map((n) => n.name);
		for (const expected of [
			'config',
			'logger',
			'database',
			'userRepository',
			'orderRepository',
			'tokenService',
			'authService',
			'orderService',
			'emailService',
		]) {
			expect(names).toContain(expected);
		}
	});

	it('all nodes have missing: false', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		expect(nodes.every((n) => n.missing === false)).toBe(true);
	});

	it('classifies node types correctly', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		const byName = Object.fromEntries(nodes.map((n) => [n.name, n.type]));
		expect(byName.config).toBe('value');
		expect(byName.tokenService).toBe('function');
		expect(byName.logger).toBe('class');
		expect(byName.database).toBe('class');
	});

	it('extracts dependencies for a single-dep class', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		const userRepo = nodes.find((n) => n.name === 'userRepository');
		expect(userRepo?.dependencies).toEqual(['database']);
	});

	it('extracts dependencies for a multi-dep class', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		const db = nodes.find((n) => n.name === 'database');
		expect(db?.dependencies).toEqual(['logger', 'config']);
	});

	it('extracts dependencies for a factory function', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		const token = nodes.find((n) => n.name === 'tokenService');
		expect(token?.dependencies).toEqual(['config']);
	});

	it('includes the missing smtpClient dep in emailService', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		const email = nodes.find((n) => n.name === 'emailService');
		expect(email?.dependencies).toContain('smtpClient');
	});

	it('captures SINGLETON lifetime', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		expect(nodes.find((n) => n.name === 'logger')?.lifetime).toBe('SINGLETON');
		expect(nodes.find((n) => n.name === 'database')?.lifetime).toBe('SINGLETON');
	});

	it('has no lifetime for value registrations', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		expect(nodes.find((n) => n.name === 'config')?.lifetime).toBeUndefined();
	});

	it('has no lifetime when not specified', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		expect(nodes.find((n) => n.name === 'authService')?.lifetime).toBeUndefined();
	});

	it('value registrations have empty deps', () => {
		const nodes = analyzeContainerFile(EXAMPLE);
		expect(nodes.find((n) => n.name === 'config')?.dependencies).toEqual([]);
	});

	it('throws for a non-existent file', () => {
		expect(() => analyzeContainerFile('/no/such/file.js')).toThrow();
	});
});

describe('analyzeContainerFile — inline fixtures', () => {
	const FIXTURES = path.join(__dirname, 'fixtures');

	it('detects aliasTo registrations', async () => {
		const { buildFixture } = await import('./fixtures/helper');
		const file = await buildFixture('alias', `
const { createContainer, asClass, aliasTo } = require('awilix');
class Logger {}
const c = createContainer();
c.register({ logger: asClass(Logger), log: aliasTo('logger') });
module.exports = c;
		`);
		const nodes = analyzeContainerFile(file);
		const alias = nodes.find((n) => n.name === 'log');
		expect(alias?.type).toBe('alias');
		expect(alias?.dependencies).toEqual(['logger']);
	});

	it('extracts CLASSIC-mode positional params', async () => {
		const { buildFixture } = await import('./fixtures/helper');
		const file = await buildFixture('classic', `
const { createContainer, asFunction, InjectionMode } = require('awilix');
const factory = (db, cache) => ({ db, cache });
const c = createContainer({ injectionMode: InjectionMode.CLASSIC });
c.register({ svc: asFunction(factory) });
module.exports = c;
		`);
		const nodes = analyzeContainerFile(file);
		expect(nodes.find((n) => n.name === 'svc')?.dependencies).toEqual(['db', 'cache']);
	});

	it('extracts named-container PROXY pattern', async () => {
		const { buildFixture } = await import('./fixtures/helper');
		const file = await buildFixture('named-container', `
const { createContainer, asFunction } = require('awilix');
const factory = (container) => {
  const db = container.db;
  const cache = container.cache;
  return { db, cache };
};
const c = createContainer();
c.register({ svc: asFunction(factory) });
module.exports = c;
		`);
		const nodes = analyzeContainerFile(file);
		const deps = nodes.find((n) => n.name === 'svc')?.dependencies ?? [];
		expect(deps).toContain('db');
		expect(deps).toContain('cache');
	});

	it('extracts TRANSIENT and SCOPED lifetimes', async () => {
		const { buildFixture } = await import('./fixtures/helper');
		const file = await buildFixture('lifetimes', `
const { createContainer, asClass, Lifetime } = require('awilix');
class A {}
class B {}
const c = createContainer();
c.register({
  a: asClass(A, { lifetime: Lifetime.TRANSIENT }),
  b: asClass(B, { lifetime: Lifetime.SCOPED }),
});
module.exports = c;
		`);
		const nodes = analyzeContainerFile(file);
		expect(nodes.find((n) => n.name === 'a')?.lifetime).toBe('TRANSIENT');
		expect(nodes.find((n) => n.name === 'b')?.lifetime).toBe('SCOPED');
	});

	it('handles cross-file imports', async () => {
		const { buildMultiFileFixture } = await import('./fixtures/helper');
		const file = await buildMultiFileFixture('cross-file', {
			'service.js': `
class MyService {
  constructor({ dep1, dep2 }) {}
}
module.exports = { MyService };
			`,
			'container.js': `
const { createContainer, asClass } = require('awilix');
const { MyService } = require('./service');
const c = createContainer();
c.register({ svc: asClass(MyService) });
module.exports = c;
			`,
		}, 'container.js');
		const nodes = analyzeContainerFile(file);
		expect(nodes.find((n) => n.name === 'svc')?.dependencies).toEqual(['dep1', 'dep2']);
	});
});
