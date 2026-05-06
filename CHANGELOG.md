# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-06

### Added

- **Lifetime violation detection** — `detectViolations` catches _captive dependency_ bugs statically:
  - `SINGLETON → SCOPED` or `SINGLETON → TRANSIENT` → **error** (singleton captures a short-lived instance)
  - `SCOPED → TRANSIENT` → **warning** (scoped caches a transient per scope instead of per call)
  - Nodes without an explicit lifetime are skipped (no false positives)
- Violation highlighting in all output formats:
  - **HTML** — dedicated violations section (red/orange) + Mermaid edges coloured via `linkStyle`
  - **DOT** — violation edges rendered in red/orange with a `SINGLETON→TRANSIENT` label
  - **Mermaid** — violation edges styled with `linkStyle` (red = error, orange = warning)
- `--fail-on <checks>` CLI flag — exit code 1 on `violations`, `cycles`, or `all`; enables CI gating
- `detectViolations`, `LifetimeViolation`, `ViolationSeverity` added to the programmatic API
- HTML lazy rendering via `IntersectionObserver` — diagrams render only when scrolled into view, preventing browser freeze on large containers
- Auto-fallback when `--format mermaid --open` source exceeds mermaid.live's 50 000-char limit: the graph is re-rendered as HTML and opened from a temp file, with a warning on stderr
- Error nodes: registrations that throw during inspection are collected as `type: 'error'` nodes (with the error message) instead of crashing the whole run; reported on stderr and shown in `--list`

### Changed

- **Interactive HTML** — `--format html` now generates a fully interactive vis.js Network page instead of static Mermaid diagrams:
  - **Click any node** → slide-in detail panel showing type, lifetime, direct dependencies, reverse dependencies (used-by), and any violations involving that node; clicking a dep in the panel navigates to it in the graph
  - **Search** (`/` to focus) — filters nodes in real-time; non-matching nodes dim to 15% opacity
  - **Lifetime filter** — All / SINGLETON / SCOPED / TRANSIENT toggle buttons
  - **Type filter** — All / class / function / value / alias / missing toggle buttons
  - **⊞ Fit** — zoom to fit all visible nodes
  - **⚡ Physics** — toggle force simulation on/off; DAG-like graphs use hierarchical LR layout, cyclic graphs start with force-directed layout
  - **Violation edges** rendered in red/orange with a `SINGLETON→TRANSIENT` label; violation badges shown inline in the detail panel
  - **No node count limit** — vis.js renders arbitrarily large graphs in a single unified view (no more diagram splitting)
  - Violations and Cycles sections are still displayed below the graph

### Fixed

- HTML multi-diagram: `nodeToBlock` index was stale when a block was sub-chunked, causing cross-links to point to wrong diagrams
- `detectCycles`: replaced recursive DFS with iterative to prevent stack overflow on deep dependency chains (> ~10 000 nodes)
- `focusSubgraph` / `limitDepth`: replaced `Array.shift()` (O(n²) BFS) with an index-pointer (O(n))
- `formatMermaid`: two registrations whose names differ only in special characters (e.g. `my-svc` vs `my.svc`) now get distinct Mermaid node IDs instead of silently colliding
- HTML cross-link generation now uses a pre-built outgoing-edge index (O(n+e) instead of O(n×e))
- `focusSubgraph` error message is now truncated to the first 20 names when the container is very large

### Removed

- Mermaid-based HTML output (chunking into multiple diagrams, lazy IntersectionObserver rendering, cross-diagram links) — replaced entirely by vis.js interactive graph

## [0.1.1] - 2026-05-06

### Added

- HTML output splits large graphs into multiple Mermaid diagrams (40 nodes/block, sub-chunked to 10 if still above the 48 000-char parser limit) with cross-diagram navigation links
- Error handling per node: `inspectContainer` catches resolver errors and returns `type: 'error'` nodes

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
