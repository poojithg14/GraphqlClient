# GraphQL Client for VS Code

A full-featured GraphQL client built into VS Code. Manage collections, switch environments, run queries, and explore your schema — all without leaving the editor.

## Features

### Collections & Requests
- Organize queries, mutations, and subscriptions into collections with folders
- Create requests with auto-generated query templates that detect patterns from the name (e.g., "GetUsers" generates a paginated list query, "CreateUser" generates a mutation with input type)
- Import/export collections as JSON
- Duplicate, rename, and delete with right-click context menus

### Schema Introspection
- Fetch and browse your GraphQL schema directly in the sidebar
- Collapsible Queries and Mutations tree showing all available operations
- Click any field to auto-generate a complete operation with:
  - Proper variable declarations and types
  - Argument usage
  - Nested return field selection (depth 2, cycle-safe)
  - Default variable values matching the schema types
- Schema is cached per workspace for instant reload

### Environments
- Define multiple environments (dev, staging, production) with separate endpoints and headers
- Switch active environment to target different servers
- Per-workspace storage — each project gets its own collections, environments, and history

### Secrets
- Store sensitive values (API keys, tokens) in VS Code's secure secret storage
- Reference secrets in headers and endpoints with `${secret:MY_KEY}` syntax
- Secrets are resolved at execution time and never stored in plain text

### Editor Panel
- Full query editor with syntax highlighting
- Variables editor with JSON validation
- Custom headers per request
- Response viewer with timing information
- Request history (last 50 entries per workspace)
- **Save prompt on close** — closing a dirty tab prompts Save / Don't Save / Cancel; closing the panel prompts to save all unsaved tabs
- Dirty indicator dot on tabs with unsaved changes

## Getting Started

1. Open the GraphQL Client from the activity bar (graph icon on the left)
2. Create a collection and add a folder
3. Add a request — the query template is auto-generated from the name
4. Click the request to open it in the editor panel
5. Hit **Execute** to run the query against your active environment

### Schema Introspection

1. Make sure your active environment points to a running GraphQL endpoint
2. In the sidebar, scroll down to **Schema Explorer**
3. Click **Introspect Schema** (or the refresh button)
4. Browse the Queries and Mutations tree
5. Click any field to generate an operation and open it in the editor

## Requirements

- VS Code 1.85.0 or later
- A GraphQL endpoint that supports introspection (for schema features)

## Authors

- **Poojith Gavini** — Author
- **Sujjad Ali Mohammad** — Co-contributor
- **Dinesh Bukya** — Co-contributor
- **Ganesh Pinjala** — Co-contributor
- **Kanishuk Reddy Lingareddy Gari** — Co-contributor
- **Nithish Japala** — Co-contributor
