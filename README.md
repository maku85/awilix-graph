# awilix-graph

[![CI](https://github.com/maku85/awilix-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/maku85/awilix-graph/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/awilix-graph)](https://www.npmjs.com/package/awilix-graph)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/awilix-graph)](package.json)

Inspect an [Awilix](https://github.com/jeffijoe/awilix) DI container and generate a visual dependency graph. Useful for onboarding and debugging complex dependency injection setups.

## Features

- **Four output formats** — Mermaid, Graphviz DOT, JSON, self-contained HTML
- **Lifetime annotations** — SINGLETON / TRANSIENT / SCOPED shown in every node
- **Missing dependency detection** — unregistered deps appear as distinct nodes
- **Cycle detection** — circular dependencies highlighted in every format
- **`--focus <name>`** — zoom in on the subgraph around a single registration
- **`--depth <n>`** — limit graph depth (works standalone or combined with `--focus`)
- **`--open`** — open the result in the browser instantly (Mermaid Live / GraphvizOnline)
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
  --open                   Open the result in the browser after rendering
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
| `mermaid` | [mermaid.live](https://mermaid.live) with the diagram pre-loaded |
| `dot` | [GraphvizOnline](https://dreampuf.github.io/GraphvizOnline) with the source pre-loaded |
| `html` | Temporary `.html` file in the OS default browser |
| `json` | Temporary `.json` file with the OS default app |

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

### Graphviz DOT (`-f dot`)

```bash
awilix-graph -c src/container.ts -f dot | dot -Tsvg -o graph.svg
```

SINGLETON nodes have a double outline (`peripheries=2`); SCOPED nodes have a bold border (`penwidth=2`).

### JSON (`-f json`)

```json
{
  "nodes": [
    { "name": "logger", "type": "class", "dependencies": [], "missing": false, "lifetime": "SINGLETON" },
    { "name": "database", "type": "class", "dependencies": ["logger", "config"], "missing": false, "lifetime": "SINGLETON" }
  ],
  "edges": [
    { "from": "database", "to": "logger" }
  ],
  "cycles": []
}
```

### Self-contained HTML (`-f html`)

Generates a standalone `.html` file with Mermaid.js loaded from CDN. Open it in any browser — no server needed.

```bash
awilix-graph -c src/container.ts -f html -o docs/graph.html
```

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
```

## Node types

| Symbol | Shape (Mermaid) | Type | Description |
|---|---|---|---|
| `◆` | `["…"]` rectangle | class | `asClass()` registration |
| `◇` | `("…")` rounded | function | `asFunction()` registration |
| `●` | `{{"…"}}` double brace | value | `asValue()` registration |
| `→` | `[/"…"/]` parallelogram | alias | `aliasTo()` registration |
| `?` | `["…"]` dashed | missing | dependency not registered in the container |

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
import { render, inspect, renderGraph, focusSubgraph, limitDepth } from 'awilix-graph'

const container = createContainer().register({ ... })

// highest-level: inspect + render in one call
const mermaid = render(container, 'mermaid')

// or work with the graph data structure directly
const graph = inspect(container)
console.log(graph.nodes)   // GraphNode[]
console.log(graph.edges)   // GraphEdge[]
console.log(graph.cycles)  // string[][]

// render to any format
const dot  = renderGraph(graph, 'dot')
const json = renderGraph(graph, 'json')
const html = renderGraph(graph, 'html')

// subgraph around one node
const sub = focusSubgraph(graph, 'authService', /* depth */ 2)

// limit to the first N levels from root nodes
const shallow = limitDepth(graph, 2)
```

### Type reference

```ts
type NodeType  = 'class' | 'function' | 'value' | 'alias' | 'unknown'
type Lifetime  = 'SINGLETON' | 'TRANSIENT' | 'SCOPED'
type OutputFormat = 'dot' | 'mermaid' | 'json' | 'html'

interface GraphNode {
  name:         string
  type:         NodeType
  dependencies: string[]
  missing:      boolean
  lifetime?:    Lifetime
}

interface GraphEdge { from: string; to: string }

interface DependencyGraph {
  nodes:  GraphNode[]
  edges:  GraphEdge[]
  cycles: string[][]
}
```

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup instructions, project structure, and PR guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
