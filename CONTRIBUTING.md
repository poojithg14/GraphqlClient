# Contributing to GraphQL CLNT

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [VS Code](https://code.visualstudio.com/) 1.85 or later

### Getting Started

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Press `F5` in VS Code to launch the Extension Development Host

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Bundle the extension with esbuild |
| `npm run watch` | Rebuild on file changes |
| `npm run lint` | Type-check with TypeScript (no emit) |
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
├── media/                  # Webview HTML, CSS, JS
├── resources/              # Extension icons
├── dist/                   # Bundled output (gitignored)
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript config
└── esbuild.js              # Build script
```

## Architecture

The extension follows VS Code's webview extension pattern:

- **Extension Host** (`src/`): Runs in Node.js. Handles storage, schema introspection, query execution, and all business logic.
- **Webview** (`media/`): Runs in a sandboxed iframe. Plain HTML/CSS/JS UI that communicates with the extension host via `postMessage`.
- **Communication**: The webview sends typed messages (`WebviewMessage`) to the extension host, which replies with `ExtensionMessage` responses.

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run lint` and `npm test` pass
4. Submit a pull request with a clear description of the change

### PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Add tests for new pure-logic modules
- Update `CHANGELOG.md` if adding user-facing changes
- Follow existing code style (TypeScript strict mode, no `any` where avoidable)

## Reporting Issues

Use [GitHub Issues](https://github.com/poojithg14/GraphqlClient/issues) to report bugs or request features. Please include:

- VS Code version
- Extension version
- Steps to reproduce (for bugs)
- Expected vs actual behavior
