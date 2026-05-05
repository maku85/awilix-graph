import { Lifetime, aliasTo, asClass, asFunction, asValue, createContainer } from 'awilix';
import { describe, expect, it } from 'vitest';
import { inspectContainer } from '../src/inspect';

// --- fixtures ---

class Logger {
	log(msg: string) {
		void msg;
	}
}

class Database {
	constructor({ logger }: { logger: Logger }) {
		void logger;
	}
}

class AuthService {
	constructor({ database, logger }: { database: Database; logger: Logger }) {
		void database;
		void logger;
	}
}

const makeTokenService = ({ config }: { config: unknown }) => ({ config });

// --- tests ---

describe('inspectContainer', () => {
	it('detects class registrations', () => {
		const c = createContainer();
		c.register({ logger: asClass(Logger) });
		const nodes = inspectContainer(c);
		expect(nodes.find((n) => n.name === 'logger')?.type).toBe('class');
	});

	it('detects function registrations', () => {
		const c = createContainer();
		c.register({ token: asFunction(makeTokenService) });
		const nodes = inspectContainer(c);
		expect(nodes.find((n) => n.name === 'token')?.type).toBe('function');
	});

	it('detects value registrations', () => {
		const c = createContainer();
		c.register({ config: asValue({ port: 3000 }) });
		const nodes = inspectContainer(c);
		expect(nodes.find((n) => n.name === 'config')?.type).toBe('value');
	});

	it('detects aliasTo registrations', () => {
		const c = createContainer();
		c.register({ logger: asClass(Logger), log: aliasTo('logger') });
		const nodes = inspectContainer(c);
		const alias = nodes.find((n) => n.name === 'log');
		expect(alias?.type).toBe('alias');
		expect(alias?.dependencies).toEqual(['logger']);
	});

	it('extracts single dependency', () => {
		const c = createContainer();
		c.register({ database: asClass(Database) });
		const nodes = inspectContainer(c);
		expect(nodes.find((n) => n.name === 'database')?.dependencies).toEqual(['logger']);
	});

	it('extracts multiple dependencies', () => {
		const c = createContainer();
		c.register({ auth: asClass(AuthService) });
		const nodes = inspectContainer(c);
		expect(nodes.find((n) => n.name === 'auth')?.dependencies).toEqual(['database', 'logger']);
	});

	it('extracts function dependencies', () => {
		const c = createContainer();
		c.register({ token: asFunction(makeTokenService) });
		const nodes = inspectContainer(c);
		expect(nodes.find((n) => n.name === 'token')?.dependencies).toEqual(['config']);
	});

	it('returns empty dependencies for value registrations', () => {
		const c = createContainer();
		c.register({ config: asValue(42) });
		const nodes = inspectContainer(c);
		expect(nodes.find((n) => n.name === 'config')?.dependencies).toEqual([]);
	});

	it('all nodes have missing: false', () => {
		const c = createContainer();
		c.register({ logger: asClass(Logger), config: asValue({}) });
		const nodes = inspectContainer(c);
		expect(nodes.every((n) => n.missing === false)).toBe(true);
	});

	it('captures SINGLETON lifetime', () => {
		const c = createContainer();
		c.register({ logger: asClass(Logger, { lifetime: Lifetime.SINGLETON }) });
		const node = inspectContainer(c).find((n) => n.name === 'logger');
		expect(node?.lifetime).toBe('SINGLETON');
	});

	it('captures TRANSIENT lifetime', () => {
		const c = createContainer();
		c.register({ logger: asClass(Logger, { lifetime: Lifetime.TRANSIENT }) });
		const node = inspectContainer(c).find((n) => n.name === 'logger');
		expect(node?.lifetime).toBe('TRANSIENT');
	});

	it('captures SCOPED lifetime', () => {
		const c = createContainer();
		c.register({ logger: asClass(Logger, { lifetime: Lifetime.SCOPED }) });
		const node = inspectContainer(c).find((n) => n.name === 'logger');
		expect(node?.lifetime).toBe('SCOPED');
	});

	it('has no lifetime for value registrations', () => {
		const c = createContainer();
		c.register({ config: asValue(42) });
		const node = inspectContainer(c).find((n) => n.name === 'config');
		expect(node?.lifetime).toBeUndefined();
	});

	it('has no lifetime for alias registrations', () => {
		const c = createContainer();
		c.register({ logger: asClass(Logger), log: aliasTo('logger') });
		const node = inspectContainer(c).find((n) => n.name === 'log');
		expect(node?.lifetime).toBeUndefined();
	});

	it('throws for non-container input', () => {
		expect(() => inspectContainer({ registrations: null as unknown as Record<string, unknown> } )).toThrow();
	});

	it('handles a mix of all registration types', () => {
		const c = createContainer();
		c.register({
			logger: asClass(Logger),
			database: asClass(Database),
			token: asFunction(makeTokenService),
			config: asValue({}),
			log: aliasTo('logger'),
		});
		const nodes = inspectContainer(c);
		const types = Object.fromEntries(nodes.map((n) => [n.name, n.type]));
		expect(types).toMatchObject({
			logger: 'class',
			database: 'class',
			token: 'function',
			config: 'value',
			log: 'alias',
		});
	});
});
