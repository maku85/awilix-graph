import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { GraphNode, Lifetime, NodeType } from './types';

const AWILIX_FACTORIES = new Set([
	'asClass',
	'asFunction',
	'asValue',
	'aliasTo',
]);

/**
 * Parse an Awilix container file via the TypeScript compiler AST and return
 * the list of registered nodes with their types, dependencies, and lifetimes.
 *
 * This is a purely static analysis — no code is executed, so no side effects
 * occur and the result is deterministic regardless of runtime state.
 *
 * Limitations:
 *  - Dynamically computed registration keys (`{ [name]: asClass(Foo) }`) are skipped.
 *  - Classes/functions imported from node_modules yield empty dependency lists.
 *  - Object spread inside register({ ...base }) is not followed.
 *  - Project-local tsconfig.json path aliases are not resolved.
 *
 * For these edge cases the node is still emitted (type + lifetime are known
 * from the register call) but `dependencies` will be `[]`.
 */
export function analyzeContainerFile(containerPath: string): GraphNode[] {
	const absPath = path.resolve(process.cwd(), containerPath);

	const options: ts.CompilerOptions = {
		allowJs: true,
		checkJs: false,
		noEmit: true,
		skipLibCheck: true,
		allowSyntheticDefaultImports: true,
		esModuleInterop: true,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
		strict: false,
	};

	if (!fs.existsSync(absPath)) {
		throw new Error(`Container file not found: ${absPath}`);
	}

	const program = ts.createProgram([absPath], options);
	const checker = program.getTypeChecker();
	const sourceFile = program.getSourceFile(absPath);

	if (!sourceFile) {
		throw new Error(`Could not parse container file: ${absPath}`);
	}

	const nodes: GraphNode[] = [];

	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			nodes.push(...tryExtractRegister(node, checker));
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return nodes;
}

// ── register() call extraction ────────────────────────────────────────────────

function tryExtractRegister(
	call: ts.CallExpression,
	checker: ts.TypeChecker
): GraphNode[] {
	// Match: <anything>.register({ key: asClass(Foo), ... })
	if (!ts.isPropertyAccessExpression(call.expression)) return [];
	if (call.expression.name.text !== 'register') return [];
	if (call.arguments.length !== 1) return [];
	const arg = call.arguments[0];
	if (!ts.isObjectLiteralExpression(arg)) return [];

	const result: GraphNode[] = [];
	for (const prop of arg.properties) {
		if (!ts.isPropertyAssignment(prop)) continue; // skip spread, shorthand
		const name = getPropName(prop);
		if (!name) continue; // skip computed keys
		if (!ts.isCallExpression(prop.initializer)) continue;
		const node = tryExtractRegistration(name, prop.initializer, checker);
		if (node) result.push(node);
	}
	return result;
}

function tryExtractRegistration(
	name: string,
	call: ts.CallExpression,
	checker: ts.TypeChecker
): GraphNode | null {
	if (!ts.isIdentifier(call.expression)) return null;
	const factory = call.expression.text;
	if (!AWILIX_FACTORIES.has(factory)) return null;

	if (factory === 'asValue') {
		return { name, type: 'value', dependencies: [], missing: false };
	}

	if (factory === 'aliasTo') {
		const arg = call.arguments[0];
		const target = ts.isStringLiteral(arg) ? arg.text : undefined;
		return {
			name,
			type: 'alias',
			dependencies: target ? [target] : [],
			missing: false,
		};
	}

	// asClass / asFunction
	const type: NodeType = factory === 'asClass' ? 'class' : 'function';
	const lifetime = extractLifetime(call.arguments[1]);
	const deps = call.arguments[0] ? extractDeps(call.arguments[0], checker) : [];
	return { name, type, dependencies: deps, missing: false, lifetime };
}

// ── dependency extraction ─────────────────────────────────────────────────────

function extractDeps(expr: ts.Expression, checker: ts.TypeChecker): string[] {
	if (!ts.isIdentifier(expr)) return [];

	// Primary: symbol-based lookup (works for same-file declarations).
	const sym = checker.getSymbolAtLocation(expr);
	if (sym) {
		const decls = sym.getDeclarations();
		if (decls?.length) {
			const decl = decls[0];
			if (!decl.getSourceFile().fileName.includes('node_modules')) {
				// For indirect bindings (destructured require / import specifiers) the
				// symbol points to the binding site, not the original class. Try direct
				// extraction first; only fall through to the type-based path when the
				// declaration is clearly an indirect binding.
				if (!isIndirectBinding(decl)) {
					return extractFromDecl(decl);
				}
			}
		}
	}

	// Fallback: use the type of the expression to find the actual class/function
	// declaration across files (handles `const { Foo } = require('./foo')` and
	// `import { Foo } from './foo'` patterns).
	const type = checker.getTypeAtLocation(expr);
	const typeSym = type.getSymbol();
	if (typeSym) {
		const typeDecls = typeSym.getDeclarations();
		if (typeDecls?.length) {
			const decl = typeDecls[0];
			if (!decl.getSourceFile().fileName.includes('node_modules')) {
				return extractFromDecl(decl);
			}
		}
	}

	return [];
}

function isIndirectBinding(decl: ts.Declaration): boolean {
	return (
		ts.isBindingElement(decl) ||
		ts.isImportSpecifier(decl) ||
		ts.isImportClause(decl) ||
		ts.isNamespaceImport(decl)
	);
}

function extractFromDecl(decl: ts.Declaration): string[] {
	if (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) {
		const ctor = decl.members.find(ts.isConstructorDeclaration);
		if (!ctor?.parameters.length) return [];
		return extractFromParam(ctor.parameters[0]);
	}

	if (
		ts.isFunctionDeclaration(decl) ||
		ts.isFunctionExpression(decl) ||
		ts.isArrowFunction(decl)
	) {
		if (!decl.parameters.length) return [];
		return extractFromParam(decl.parameters[0]);
	}

	// const foo = (...) => ...  /  const foo = function(...) { ... }
	if (ts.isVariableDeclaration(decl) && decl.initializer) {
		const init = decl.initializer;
		if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
			if (!init.parameters.length) return [];
			return extractFromParam(init.parameters[0]);
		}
	}

	return [];
}

function extractFromParam(param: ts.ParameterDeclaration): string[] {
	// PROXY destructured: ({ dep1, dep2, dep3: alias })
	if (ts.isObjectBindingPattern(param.name)) {
		return param.name.elements
			.filter((el) => !el.dotDotDotToken) // skip ...rest
			.map((el) => {
				// { dep: localAlias } → the container key is `dep`
				const key = el.propertyName ?? el.name;
				return ts.isIdentifier(key) ? key.text : '';
			})
			.filter(Boolean);
	}

	if (ts.isIdentifier(param.name)) {
		const parent = param.parent;
		const isFunctionLike =
			ts.isFunctionDeclaration(parent) ||
			ts.isFunctionExpression(parent) ||
			ts.isArrowFunction(parent) ||
			ts.isConstructorDeclaration(parent);

		if (!isFunctionLike) return [];

		if (parent.parameters.length > 1) {
			// CLASSIC mode: (dep1, dep2, dep3) — each param name is a container key.
			return parent.parameters
				.map((p) => (ts.isIdentifier(p.name) ? p.name.text : ''))
				.filter(Boolean);
		}

		// PROXY named-container: (container) => { container.dep1; container.dep2 }
		// Trace every `container.xxx` and `container['xxx']` access in the body.
		return tracePropertyAccesses(param.name.text, parent.body);
	}

	return [];
}

function tracePropertyAccesses(
	paramName: string,
	body: ts.ConciseBody | undefined
): string[] {
	if (!body) return [];
	const deps = new Set<string>();

	function visit(node: ts.Node): void {
		// container.dep
		if (
			ts.isPropertyAccessExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === paramName
		) {
			deps.add(node.name.text);
		}
		// container['dep']
		if (
			ts.isElementAccessExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === paramName &&
			ts.isStringLiteral(node.argumentExpression)
		) {
			deps.add(node.argumentExpression.text);
		}
		ts.forEachChild(node, visit);
	}

	visit(body);
	return [...deps];
}

// ── lifetime / property helpers ───────────────────────────────────────────────

function extractLifetime(arg: ts.Expression | undefined): Lifetime | undefined {
	if (!arg || !ts.isObjectLiteralExpression(arg)) return undefined;

	const lifetimeProp = arg.properties.find(
		(p): p is ts.PropertyAssignment =>
			ts.isPropertyAssignment(p) &&
			ts.isIdentifier(p.name) &&
			p.name.text === 'lifetime'
	);
	if (!lifetimeProp) return undefined;

	const val = lifetimeProp.initializer;

	// { lifetime: 'SINGLETON' }
	if (ts.isStringLiteral(val)) return toLifetime(val.text);

	// { lifetime: Lifetime.SINGLETON }
	if (ts.isPropertyAccessExpression(val)) return toLifetime(val.name.text);

	return undefined;
}

function toLifetime(raw: string): Lifetime | undefined {
	if (raw === 'SINGLETON' || raw === 'TRANSIENT' || raw === 'SCOPED')
		return raw;
	return undefined;
}

function getPropName(prop: ts.PropertyAssignment): string | null {
	if (ts.isIdentifier(prop.name)) return prop.name.text;
	if (ts.isStringLiteral(prop.name)) return prop.name.text;
	return null; // computed key — skip
}
