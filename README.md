# awilix-graph

[![CI](https://github.com/maku85/awilix-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/maku85/awilix-graph/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/awilix-graph)](https://www.npmjs.com/package/awilix-graph)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/awilix-graph)](package.json)

Inspect an [Awilix](https://github.com/jeffijoe/awilix) DI container and generate a visual dependency graph. Useful for onboarding, debugging, and auditing complex dependency injection setups.

## Features

- **Four output formats** — Mermaid, Graphviz DOT, JSON, interactive HTML
- **Interactive HTML** — vis.js graph with node click → detail panel, search, lifetime / type filters, physics toggle; no node-count limit
- **Lifetime annotations** — SINGLETON / TRANSIENT / SCOPED shown in every node
- **Lifetime violation detection** — catches captive dependency bugs statically (see below)
- **Missing dependency detection** — unregistered deps appear as distinct nodes
- **Cycle detection** — circular dependencies highlighted in every format
- **`--focus <name>`** — zoom in on the subgraph around a single registration
- **`--depth <n>`** — limit graph depth (works standalone or combined with `--focus`)
- **`--stats`** — metrics table: fan-in, fan-out, and instability per node; surfaces god objects and stable foundations at a glance
- **`--open`** — open the result in the browser instantly (Mermaid Live / GraphvizOnline / HTML)
- **`--fail-on`** — exit code 1 on violations or cycles; CI-ready
- **Programmatic API** — import and use as a library
- **ESM & CJS** — loads `.mjs`, `.cjs`, `.js`, `.ts`, `.mts` container files

## Requirements

- **Node.js** ≥ 20.0.0
- **awilix** ≥ 5.0.0 (peer dependency, installed in the project whose container you are inspecting)
- **ts-node** or **tsx** — only required to load TypeScript container files

## Installation

```bash
# as a dev tool in your project
pnpm add -D awilix-graph

# or globally
pnpm add -g awilix-graph
```

`awilix` must be installed in the project whose container you are inspecting (peer dependency, v5+).

## Quick start

```bash
# print a Mermaid diagram to stdout
awilix-graph -c src/container.ts

# open immediately in the browser
awilix-graph -c src/container.ts --open

# write a self-contained HTML file
awilix-graph -c src/container.ts -f html -o graph.html

# plain-text summary of all registrations
awilix-graph -c src/container.ts --list

# metrics table (fan-in, fan-out, instability)
awilix-graph -c src/container.ts --stats

# fail the build if lifetime violations or cycles are detected
awilix-graph -c src/container.ts --fail-on all
```

## CLI reference

```
Usage: awilix-graph [options]

Options:
  -c, --container <path>   Path to the file that exports the Awilix container
  -f, --format <format>    Output format: dot | mermaid | json | html  (default: "mermaid")
  -o, --output <file>      Write output to a file instead of stdout
  --no-missing             Exclude unregistered (missing) dependency nodes
  --focus <name>           Show only the subgraph reachable from this registration
  --depth <n>              Max traversal depth (works with --focus or standalone)
  --list                   Print a plain-text summary instead of a graph
  --stats                  Print a metrics table (fan-in, fan-out, instability)
  --open                   Open the result in the browser after rendering
  --fail-on <checks>       Exit 1 when issues are found: cycles, violations, all
  -V, --version            Print version
  -h, --help               Show help
```

### `--focus` + `--depth`

```bash
# everything reachable from authService in both directions
awilix-graph -c src/container.ts --focus authService

# only the immediate neighbours (distance ≤ 1)
awilix-graph -c src/container.ts --focus authService --depth 1
```

### `--depth` standalone

Without `--focus`, `--depth` limits the graph starting from root nodes (registrations that nothing else depends on):

```bash
# show only the top two levels of the dependency tree
awilix-graph -c src/container.ts --depth 2
```

### `--open`

| Format | Opens |
|---|---|
| `mermaid` | [mermaid.live](https://mermaid.live) with the diagram pre-loaded (falls back to HTML if source > 50 000 chars) |
| `dot` | [GraphvizOnline](https://dreampuf.github.io/GraphvizOnline) with the source pre-loaded |
| `html` | Temporary `.html` file in the OS default browser |
| `json` | Temporary `.json` file with the OS default app |

### `--fail-on`

Use this flag to block CI pipelines when structural problems are detected:

```bash
# fail on lifetime violations with severity "error" only
awilix-graph -c src/container.ts --fail-on violations

# fail on circular dependencies
awilix-graph -c src/container.ts --fail-on cycles

# fail on either
awilix-graph -c src/container.ts --fail-on all
```

Exit code is `1` when the specified condition is met, `0` otherwise (output is still written normally).

## Lifetime violations

A *captive dependency* is a bug where a longer-lived service holds a reference to a shorter-lived one, preventing the shorter-lived service from being recreated as intended.

| From | To | Severity | Description |
|------|-----|----------|-------------|
| `SINGLETON` | `SCOPED` | **error** | Singleton captures one scoped instance forever, breaking per-scope isolation |
| `SINGLETON` | `TRANSIENT` | **error** | Singleton captures one "transient" instance — it is never recreated |
| `SCOPED` | `TRANSIENT` | **warning** | Scoped service gets one transient per scope instead of per call |

Violations are reported on stderr, rendered as coloured edges in every output format, and can be used to gate CI with `--fail-on violations`.

```
⚠  Lifetime violations detected (2 errors, 1 warning):
   ✗ userRepository [SINGLETON] → dbSession [SCOPED]
   ✗ cacheService [SINGLETON] → requestContext [TRANSIENT]
   ! orderHandler [SCOPED] → factory [TRANSIENT]
```

Only services with an explicit lifetime declaration are checked — registrations without a lifetime annotation are skipped to avoid false positives.

## `--stats`

Prints a metrics table for every registered node, sorted by **fan-in** descending:

```
Container stats: 9 nodes · 1 missing · 13 edges · 0 cycles · 0 violations

  Name             Type      Lifetime    Fan-in  Fan-out  Instability
  ────────────────────────────────────────────────────────────────────
  config           value     —                3        0         0.00
  logger           class     SINGLETON        3        0         0.00
  database         class     SINGLETON        2        2         0.50
  authService      class     TRANSIENT        1        2         0.67
  userRepository   class     TRANSIENT        1        1         0.50
  tokenService     function  TRANSIENT        1        1         0.50
  emailService     class     TRANSIENT        0        3         1.00
  orderService     class     TRANSIENT        0        3         1.00
```

| Metric | Formula | What it tells you |
|---|---|---|
| **Fan-in** | incoming edges | How many services depend on this node — high = stable foundation |
| **Fan-out** | outgoing edges | How many dependencies this node has — high = tightly coupled |
| **Instability** | `fanOut / (fanIn + fanOut)` | 0 = pure provider (stable), 1 = pure consumer (unstable) |

Nodes with `fan-in = fan-out = 0` are reported separately as **isolated nodes** — they are registered but nothing connects them to the rest of the graph.

## Output formats

### Mermaid (default)

```
graph LR
  config{{"config<br/>(value)"}}
  logger["logger<br/>(class · SINGLETON)"]
  database["database<br/>(class · SINGLETON)"]
  tokenService("tokenService<br/>(function · TRANSIENT)")
  authService["authService<br/>(class · TRANSIENT)"]
  ...
  database --> logger
  database --> config
  authService --> userRepository
  authService --> tokenService
```

Paste into [mermaid.live](https://mermaid.live) or embed directly in Markdown / Notion / GitHub.

Violation edges are highlighted with `linkStyle` (red = error, orange = warning).

### Graphviz DOT (`-f dot`)

```bash
awilix-graph -c src/container.ts -f dot | dot -Tsvg -o graph.svg
```

SINGLETON nodes have a double outline (`peripheries=2`); SCOPED nodes have a bold border (`penwidth=2`). Violation edges are coloured red or orange with a lifetime label.

### JSON (`-f json`)

```json
{
  "nodes": [
    { "name": "logger",   "type": "class", "dependencies": [], "missing": false, "lifetime": "SINGLETON" },
    { "name": "database", "type": "class", "dependencies": ["logger", "config"], "missing": false, "lifetime": "SINGLETON" }
  ],
  "edges": [
    { "from": "database", "to": "logger" }
  ],
  "cycles": [],
  "violations": []
}
```

### Interactive HTML (`-f html`)

Generates a self-contained interactive `.html` file powered by [vis.js Network](https://visjs.github.io/vis-network/). Open it in any browser — no server needed.

```bash
awilix-graph -c src/container.ts -f html -o docs/graph.html
```

**Interactive features:**

| Feature | Description |
|---|---|
| Click a node | Opens a detail panel — type, lifetime, dependencies, used-by, violations |
| Click dep in panel | Navigates the graph to that node |
| Search (`/`) | Filters nodes in real-time; non-matching nodes dim |
| Lifetime filter | Toggle All / SINGLETON / SCOPED / TRANSIENT |
| Type filter | Toggle All / class / function / value / alias / missing |
| ⊞ Fit | Zoom to fit all visible nodes |
| ⚡ Physics | Toggle force simulation on/off |

DAG-like graphs use a hierarchical left-to-right layout. Graphs with cycles start with force-directed layout (physics auto-stabilises then freezes).

Violation edges are coloured red/orange with a lifetime label. Violations and cycles are also listed in sections below the graph.

No node-count limit — vis.js renders arbitrarily large containers in a single unified view.

### `--list`

```
CLASSES
  ◆ logger [SINGLETON]
  ◆ database [SINGLETON] → [logger, config]
  ◆ userRepository [TRANSIENT] → [database]
  ◆ authService [TRANSIENT] → [userRepository, tokenService]
  ◆ orderService [TRANSIENT] → [orderRepository, authService, logger]
  ◆ emailService [TRANSIENT] → [config, logger, smtpClient]

FUNCTIONS
  ◇ tokenService [TRANSIENT] → [config]

VALUES
  ● config

UNKNOWNS
  ? smtpClient

ERRORS
  ⚠ brokenService [resolver threw: ...]
```

## Node types

| Symbol | Shape (Mermaid) | Type | Description |
|---|---|---|---|
| `◆` | `["…"]` rectangle | class | `asClass()` registration |
| `◇` | `("…")` rounded | function | `asFunction()` registration |
| `●` | `{{"…"}}` double brace | value | `asValue()` registration |
| `→` | `[/"…"/]` parallelogram | alias | `aliasTo()` registration |
| `?` | `["…"]` dashed | missing | dependency not registered in the container |
| `⚠` | `["…"]` | error | resolver threw during inspection |

## Lifetime encoding

| Lifetime | Mermaid label | DOT style |
|---|---|---|
| `SINGLETON` | `(class · SINGLETON)` | double outline (`peripheries=2`) |
| `SCOPED` | `(class · SCOPED)` | bold border (`penwidth=2`) |
| `TRANSIENT` | `(class · TRANSIENT)` | normal border |
| _(none)_ | `(value)` / `(alias)` | normal border |

## Container file formats

The file passed to `-c` can export the container in any of these ways:

```js
// direct export
module.exports = container              // CJS
export default container               // ESM

// named export
module.exports = { container }
export { container }

// factory function (sync or async)
module.exports = () => container
export default async function build() { return container }
```

Supported extensions: `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`.

TypeScript files require `ts-node` (CJS) or `tsx` (ESM) to be installed in the project.

## Programmatic API

```ts
import { createContainer, asClass, asValue } from 'awilix'
import {
  render, inspect, renderGraph,
  focusSubgraph, limitDepth,
  detectViolations, computeStats,
} from 'awilix-graph'

const container = createContainer().register({ ... })

// highest-level: inspect + render in one call
const mermaid = render(container, 'mermaid')

// or work with the graph data structure directly
const graph = inspect(container)
console.log(graph.nodes)      // GraphNode[]
console.log(graph.edges)      // GraphEdge[]
console.log(graph.cycles)     // string[][]
console.log(graph.violations) // LifetimeViolation[]

// render to any format
const dot  = renderGraph(graph, 'dot')
const json = renderGraph(graph, 'json')
const html = renderGraph(graph, 'html')

// subgraph around one node
const sub = focusSubgraph(graph, 'authService', /* depth */ 2)

// limit to the first N levels from root nodes
const shallow = limitDepth(graph, 2)

// standalone violation analysis
const violations = detectViolations(graph.nodes, graph.edges)
const errors = violations.filter(v => v.severity === 'error')

// metrics: fan-in, fan-out, instability per node
const stats = computeStats(graph)
console.log(stats.nodeCount)    // total registered nodes
console.log(stats.nodes)        // NodeStats[] sorted by fan-in desc
```

### Type reference

```ts
type NodeType         = 'class' | 'function' | 'value' | 'alias' | 'unknown' | 'error'
type Lifetime         = 'SINGLETON' | 'TRANSIENT' | 'SCOPED'
type ViolationSeverity = 'error' | 'warning'
type OutputFormat     = 'dot' | 'mermaid' | 'json' | 'html'

interface GraphNode {
  name:         string
  type:         NodeType
  dependencies: string[]
  missing:      boolean
  lifetime?:    Lifetime
  error?:       string        // present when type === 'error'
}

interface GraphEdge { from: string; to: string }

interface LifetimeViolation {
  from:          string
  to:            string
  fromLifetime:  Lifetime
  toLifetime:    Lifetime
  severity:      ViolationSeverity
}

interface DependencyGraph {
  nodes:       GraphNode[]
  edges:       GraphEdge[]
  cycles:      string[][]
  violations?: LifetimeViolation[]  // populated by buildGraph / inspect
}

interface NodeStats {
  name:         string
  type:         NodeType | 'error'
  lifetime?:    Lifetime
  fanIn:        number
  fanOut:       number
  instability:  number | null  // null when fanIn = fanOut = 0 (isolated node)
}

interface GraphStats {
  nodeCount:             number
  missingCount:          number
  edgeCount:             number
  cycleCount:            number
  violationErrorCount:   number
  violationWarningCount: number
  nodes:                 NodeStats[]  // sorted by fanIn desc
}
```

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup instructions, project structure, and PR guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
