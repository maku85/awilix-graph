# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-05

### Added

- CLI with `-c / --container`, `-f / --format`, `-o / --output`, `--no-missing`, `--list`, `--focus`, `--depth`, `--open` options
- Output formats: Mermaid, Graphviz DOT, JSON, self-contained HTML
- Node type detection: `class`, `function`, `value`, `alias`, `unknown/missing`
- Awilix lifetime annotation (`SINGLETON`, `TRANSIENT`, `SCOPED`) in all formats
- Cycle detection with visual highlighting in every output format
- `--focus <name>` — bidirectional BFS subgraph around a single registration
- `--depth <n>` — limit graph depth (standalone or combined with `--focus`)
- `--open` — open output in browser (Mermaid Live / GraphvizOnline / temp file)
- Native ESM support: `.mjs`, `.cjs`, `.mts`, `.cts`, `"type":"module"` packages
- Programmatic API: `render`, `inspect`, `renderGraph`, `focusSubgraph`, `limitDepth`
- Full Vitest test suite (unit + integration + E2E)
