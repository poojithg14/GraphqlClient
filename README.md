# GraphQL CLNT for VS Code

[![CI](https://github.com/poojithg14/GraphqlClient/actions/workflows/ci.yml/badge.svg)](https://github.com/poojithg14/GraphqlClient/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A full-featured GraphQL client extension for Visual Studio Code. Execute queries, manage collections, introspect schemas, and more — all without leaving your editor.

## Install from Marketplace

Search for **"GraphQL CLNT"** in the VS Code Extensions view, or install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=PoojithGavini.graphql-clnt).

## Features

- **Query & Mutation Execution** — Send GraphQL operations with variables and custom headers
- **Collections & Folders** — Organize saved requests into collections, import/export as JSON
- **Schema Introspection** — Fetch and browse schemas with auto-generated operations from the field explorer
- **Schema Diff & Impact Analysis** — Compare schema versions and see which saved queries break
- **Auto-Heal Queries** — Automatically rename or remove fields broken by schema changes
- **Query Cost Estimation** — Predict query complexity based on field count, depth, and list multipliers
- **Security Analysis** — Detect depth attacks, alias abuse, sensitive fields, and missing pagination
- **Performance Tracking** — Track response times with anomaly detection (Welford's algorithm)
- **Natural Language to GraphQL** — Describe what you want in plain English and get a generated query
- **GraphQL Service Detection** — Auto-discover running GraphQL endpoints by scanning workspace ports

## Getting Started

### Prerequisites

- [VS Code](https://code.visualstudio.com/) 1.85+
- [Node.js](https://nodejs.org/) 18+ (for development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/poojithg14/GraphqlClient.git
   cd GraphqlClient
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Press **F5** in VS Code to launch the Extension Development Host

### Usage

1. Open the **GraphQL CLNT** panel from the Activity Bar
2. Enter your endpoint URL and any required headers
3. Write your query and click **Execute**
4. Use the sidebar to manage collections, browse schemas, and view history

## Development

| Command | Description |
|---------|-------------|
| `npm run build` | Bundle the extension with esbuild |
| `npm run watch` | Rebuild on file changes |
| `npm run lint` | Type-check with TypeScript |
| `npm test` | Run unit tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |

## Project Structure

```
├── src/                    # TypeScript source
│   ├── extension.ts        # Extension entry point
│   ├── webviewProvider.ts  # Webview sidebar provider
│   ├── editorPanel.ts      # Editor tab panels
│   ├── graphqlExecutor.ts  # Query execution engine
│   ├── schemaIntrospector.ts # Schema introspection
│   ├── schemaDiffer.ts     # Schema diff & impact analysis
│   ├── queryHealer.ts      # Auto-heal broken queries
│   ├── queryCostCalculator.ts # Query cost estimation
│   ├── querySecurityAnalyzer.ts # Security analysis
│   ├── sdlParser.ts        # SDL / JSON schema parser
│   ├── responseDiffer.ts   # Cross-environment response diffing
│   ├── performanceTracker.ts # Performance anomaly detection
│   ├── nlToGraphql.ts      # Natural language to GraphQL
│   ├── serviceDetector.ts  # GraphQL service auto-detection
│   ├── storage.ts          # Workspace-scoped persistence
│   └── types.ts            # Shared type definitions
├── tests/                  # Unit tests (Vitest)
├── docs/                   # Documentation
├── media/                  # Webview HTML, CSS, JS
├── resources/              # Extension icons
└── dist/                   # Bundled output (gitignored)
```

## Documentation

- [Architecture](docs/architecture.md) — system overview, component diagram, data flow
- [Features](docs/features.md) — detailed documentation for every feature
- [Message Protocol](docs/message-protocol.md) — webview ↔ extension host message reference
- [Storage Model](docs/storage.md) — persistence layer, data models, migration

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Contributors

- **Poojith Gavini** — [GitHub](https://github.com/poojithg14)
- **Ganesh Pinjala**
- **Dinesh Bukya**

## License

[MIT](LICENSE)
