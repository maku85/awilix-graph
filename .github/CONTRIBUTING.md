# Contributing

Thanks for your interest in contributing to awilix-graph!

## Setup

```bash
git clone https://github.com/maku85/awilix-graph.git
cd awilix-graph
pnpm install
```

## Development workflow

```bash
pnpm test          # run the full test suite (unit + integration + E2E)
pnpm test:watch    # re-run tests on file change
pnpm lint          # check with Biome
pnpm lint:fix      # auto-fix lint issues
pnpm build         # compile TypeScript → dist/
```

Try the CLI against the bundled example container:

```bash
pnpm example          # mermaid (default)
pnpm example:dot      # DOT / Graphviz
pnpm example:json     # JSON
```

## Project structure

```
src/
  cli.ts          entry point for the CLI
  index.ts        public programmatic API
  types.ts        shared TypeScript types
  inspect.ts      container introspection (spy-based, awilix-version-agnostic)
  graph.ts        build graph + cycle detection
  focus.ts        focusSubgraph() and limitDepth()
  load.ts         load container files (CJS, ESM, TypeScript)
  open.ts         --open flag: launch browser
  format/
    dot.ts        Graphviz DOT formatter
    mermaid.ts    Mermaid formatter
    json.ts       JSON formatter
    html.ts       self-contained HTML formatter
test/
  *.test.ts       Vitest unit tests
  fixtures/       container files used by load.test.ts and e2e.test.ts
examples/
  container.js    demo Awilix container
```

## Adding a new output format

1. Create `src/format/<name>.ts` exporting `format<Name>(graph: DependencyGraph): string`
2. Add `'<name>'` to `OutputFormat` in `src/types.ts`
3. Export the function from `src/index.ts`
4. Add the case to `renderGraph()` in `src/index.ts`
5. Add `'<name>'` to `validFormats` in `src/cli.ts` and update the `--format` description
6. Handle the format in `openGraph()` in `src/open.ts` if it needs a custom viewer
7. Add tests in `test/format.test.ts`

## Pull requests

- Keep PRs focused: one feature or fix per PR
- All tests must pass (`pnpm test`)
- No lint errors (`pnpm lint`)
- Add or update tests for any changed behaviour
- Update `CHANGELOG.md` under `[Unreleased]`
