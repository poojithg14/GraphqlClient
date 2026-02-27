# Architecture

This document describes the high-level architecture of the GraphQL CLNT VS Code extension.

## Overview

The extension follows VS Code's **webview extension pattern** with a clear separation between the Extension Host (Node.js backend) and the Webview (sandboxed browser UI). All business logic runs in the Extension Host; the Webview is a thin HTML/CSS/JS presentation layer.

```
┌──────────────────────────────────────────────────────────────────┐
│                         VS Code                                  │
│                                                                  │
│  ┌────────────────────────┐     ┌─────────────────────────────┐  │
│  │     Activity Bar       │     │       Editor Area           │  │
│  │  ┌──────────────────┐  │     │  ┌───────────────────────┐  │  │
│  │  │ Sidebar Webview  │  │     │  │   Editor Panel        │  │  │
│  │  │ (sidebar.js/css) │  │     │  │   (editor.js/css)     │  │  │
│  │  │                  │  │     │  │                       │  │  │
│  │  │  - Collections   │  │     │  │  - Query editor       │  │  │
│  │  │  - Schema browser│  │     │  │  - Response viewer    │  │  │
│  │  │  - Impact report │  │     │  │  - Headers config     │  │  │
│  │  │  - NL input      │  │     │  │  - History panel      │  │  │
│  │  │  - Schema diff   │  │     │  │  - Cost / Security    │  │  │
│  │  └────────┬─────────┘  │     │  │  - Performance stats  │  │  │
│  │           │            │     │  │  - Provenance         │  │  │
│  │           │postMessage │     │  └────────┬──────────────┘  │  │
│  └───────────┼────────────┘     └───────────┼─────────────────┘  │
│              │                              │                    │
│              ▼                              ▼                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                   Extension Host (Node.js)                │   │
│  │                                                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │   │
│  │  │ extension.ts │  │webviewProv.ts│  │ editorPanel.ts   │ │   │
│  │  │ (entry point)│  │ (sidebar)    │  │ (editor tabs)    │ │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘ │   │
│  │         │                 │                  │            │   │
│  │         ▼                 ▼                  ▼            │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │               Core Modules                       │     │   │
│  │  │                                                  │     │   │
│  │  │  graphqlExecutor    schemaIntrospector           │     │   │
│  │  │  schemaDiffer       sdlParser                    │     │   │
│  │  │  queryHealer        queryCostCalculator          │     │   │
│  │  │  querySecurityAnalyzer   responseDiffer          │     │   │
│  │  │  performanceTracker      nlToGraphql             │     │   │
│  │  │  serviceDetector                                 │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  │         │                                                 │   │
│  │         ▼                                                 │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │              storage.ts                          │     │   │
│  │  │                                                  │     │   │
│  │  │  workspaceState  │  globalState                  │     │   │
│  │  │  (per-workspace) │  (global)                     │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│                    ┌───────────────────┐                         │
│                    │  GraphQL Server   │                         │
│                    │  (user's API)     │                         │
│                    └───────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Extension Entry Point (`extension.ts`)

The `activate()` function is the bootstrap. It:

- Creates the `StorageService` and triggers workspace migration
- Instantiates `GraphQLClientViewProvider` (sidebar) and `EditorPanelManager` (editor tabs)
- Wires callbacks between sidebar and editor (e.g., clicking a request opens a tab)
- Runs auto-detection of a GraphQL endpoint on activation
- Registers VS Code commands (`graphqlClient.open`, `importCollection`, `exportCollections`)

### 2. Sidebar (`webviewProvider.ts`)

A `WebviewViewProvider` registered on the Activity Bar. Responsibilities:

- **Collection tree** — browse, create, rename, delete collections/folders/requests
- **Schema browser** — trigger introspection, browse types/fields, generate operations
- **Schema diff & impact** — compare schema versions, show broken queries
- **Auto-heal** — apply renames/removals to broken queries
- **NL-to-GraphQL** — accept natural language input, generate queries
- **Schema impact preview** — paste future SDL to predict breakages

When a user clicks a saved request, the sidebar fires `onOpenRequest`, which the extension host routes to the `EditorPanelManager`.

### 3. Editor Panel (`editorPanel.ts`)

A `WebviewPanel` that opens in the main editor area as a tab. Responsibilities:

- **Query editing** — write/edit GraphQL queries and variables
- **Execution** — send queries to the endpoint, display results
- **History** — browse and replay past executions
- **Headers** — per-request headers and shared headers management
- **Cost estimation** — calculate query cost before execution
- **Security analysis** — scan for depth attacks, alias abuse, sensitive fields
- **Performance tracking** — record response times, detect anomalies
- **Provenance** — track how a query was created and modified over time
- **Dirty state** — track unsaved changes and prompt on close

### 4. Storage (`storage.ts`)

Centralized persistence layer wrapping VS Code's three storage mechanisms:

| Storage | Scope | Used For |
|---------|-------|----------|
| `workspaceState` | Per-workspace | Collections, environments, history, schema cache, impact reports, provenance, performance stats |
| `globalState` | Global (all workspaces) | Shared headers |

A one-time migration copies legacy `globalState` data into `workspaceState` on first activation.

### 5. Core Modules

All business logic is in pure TypeScript modules with no VS Code dependency (except `serviceDetector`):

| Module | Purpose |
|--------|---------|
| `graphqlExecutor` | Sends GraphQL operations via `fetch`, measures response time and size |
| `schemaIntrospector` | Sends the standard introspection query, parses the response into `IntrospectedSchema` |
| `sdlParser` | Parses both SDL text and JSON introspection results into `IntrospectedSchema` |
| `schemaDiffer` | Compares two schemas — finds added/removed types, field renames, type changes; extracts fields from queries |
| `queryHealer` | Applies auto-fix patches (renames, removals) to query strings |
| `queryCostCalculator` | Estimates query complexity from field count, depth, and list nesting |
| `querySecurityAnalyzer` | Detects depth attacks, alias abuse, sensitive fields, missing pagination |
| `responseDiffer` | Recursively diffs two JSON responses, supports ID-based array alignment |
| `performanceTracker` | Tracks running mean/stddev using Welford's algorithm, detects anomalies |
| `nlToGraphql` | Rule-based NL parser for generating queries from natural language input |
| `serviceDetector` | Scans workspace `package.json` for port hints, probes `localhost` for GraphQL endpoints |

## Data Flow

### Query Execution Flow

```
User writes query in Editor Panel
        │
        ▼
Webview sends { type: 'executeQuery', payload: {...} }
        │
        ▼
EditorPanelManager.handleExecuteQuery()
        │
        ├── Resolve ${secret:...} placeholders in endpoint & headers
        │
        ├── Call graphqlExecutor.executeGraphQLQuery()
        │       │
        │       ├── Parse variables JSON
        │       ├── POST to GraphQL endpoint via fetch
        │       └── Return { data, responseTime, statusCode, responseSize }
        │
        ├── Update performance stats (Welford's)
        │
        ├── Detect anomalies (> 2x average)
        │
        └── Post result back to webview
```

### Schema Introspection & Impact Analysis Flow

```
User clicks "Introspect" in Sidebar
        │
        ▼
Webview sends { type: 'introspectSchema', payload: { endpoint, headers } }
        │
        ▼
WebviewProvider.handleIntrospectSchema()
        │
        ├── Save current schema as "previous"
        │
        ├── Resolve secrets in endpoint & headers
        │
        ├── Call schemaIntrospector.introspectSchema()
        │
        ├── Save new schema to storage
        │
        ├── If previous schema exists:
        │       │
        │       ├── diffSchemas(previous, new)
        │       │
        │       └── If breaking changes found:
        │               │
        │               ├── Scan all saved queries for broken fields
        │               │
        │               ├── Build ImpactReport with status per query
        │               │
        │               └── Post impactReportReady to webview
        │
        └── Post schemaLoaded to webview
```

## Communication Protocol

The sidebar and editor panel each have their own webview, each communicating with the Extension Host via `postMessage` / `onDidReceiveMessage`. Messages are typed union types:

- **Webview → Extension**: `WebviewMessage` (defined in `types.ts`)
- **Extension → Webview**: `ExtensionMessage` (defined in `types.ts`)

See [message-protocol.md](./message-protocol.md) for the full reference.

## Build Pipeline

```
src/*.ts ──► esbuild ──► dist/extension.js (single CommonJS bundle)
```

- **Bundler**: esbuild (fast, zero-config)
- **Target**: ES2022, CommonJS module format
- **Externals**: `vscode` (provided by the VS Code runtime)
- **Webview assets** (`media/`): plain HTML/CSS/JS, not bundled — served directly via `webview.asWebviewUri()`

## Security Model

- **CSP (Content Security Policy)**: each webview sets a strict CSP with a unique nonce. Only scripts with the correct nonce can execute.
- **Local resource roots**: webviews can only load files from `media/` and `resources/`.
- **No remote code**: the extension loads no external scripts or stylesheets.
