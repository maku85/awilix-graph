import { describe, expect, it } from 'vitest';
import { parseDependencies } from '../src/deps';

describe('parseDependencies', () => {
	it('returns empty array for no-arg function', () => {
		expect(parseDependencies(() => 42)).toEqual([]);
	});

	it('handles arrow function with destructured object param', () => {
		const fn = ({ dep1, dep2 }: Record<string, unknown>) => dep1 ?? dep2;
		expect(parseDependencies(fn)).toEqual(['dep1', 'dep2']);
	});

	it('handles arrow function with positional params', () => {
		const fn = (dep1: unknown, dep2: unknown) => [dep1, dep2];
		expect(parseDependencies(fn)).toEqual(['dep1', 'dep2']);
	});

	it('handles single-param arrow without parentheses', () => {
		// biome-ignore lint/style/useArrowFunction: testing named single-arg arrow
		const fn = function (x: unknown) {
			return x;
		};
		expect(parseDependencies(fn)).toEqual(['x']);
	});

	it('handles regular function with destructured param', () => {
		function fn({ logger, config }: Record<string, unknown>) {
			return logger ?? config;
		}
		expect(parseDependencies(fn)).toEqual(['logger', 'config']);
	});

	it('handles class with destructured constructor', () => {
		class Service {
			constructor({ repo, logger }: Record<string, unknown>) {
				void repo;
				void logger;
			}
		}
		expect(parseDependencies(Service)).toEqual(['repo', 'logger']);
	});

	it('returns empty array for class without constructor', () => {
		class Logger {}
		expect(parseDependencies(Logger)).toEqual([]);
	});

	it('skips rest-spread params in destructuring', () => {
		const fn = ({ a, b, ...rest }: Record<string, unknown>) => [a, b, rest];
		expect(parseDependencies(fn)).toEqual(['a', 'b']);
	});

	it('handles default values in destructuring', () => {
		const fn = ({ dep1, dep2 = 'default' }: Record<string, unknown>) => [dep1, dep2];
		expect(parseDependencies(fn)).toEqual(['dep1', 'dep2']);
	});

	it('handles RESOLVER symbol explicit injection', () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { RESOLVER } = require('awilix') as { RESOLVER: symbol };
		const fn = () => {};
		(fn as Record<symbol, unknown>)[RESOLVER] = { inject: ['dep1', 'dep2'] };
		expect(parseDependencies(fn)).toEqual(['dep1', 'dep2']);
	});

	it('handles RESOLVER symbol with function inject', () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { RESOLVER } = require('awilix') as { RESOLVER: symbol };
		const fn = () => {};
		(fn as Record<symbol, unknown>)[RESOLVER] = { inject: () => ['a', 'b'] };
		expect(parseDependencies(fn)).toEqual(['a', 'b']);
	});
});
