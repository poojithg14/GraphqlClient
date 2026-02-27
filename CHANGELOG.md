# Changelog

## 0.4.2 — Initial Release

### Features
- **Query & Mutation Execution** — Send GraphQL operations with variables and custom headers
- **Collections & Folders** — Organize saved requests into collections with folders, import/export as JSON
- **Schema Introspection** — Fetch and browse schemas with auto-generated operations from the field explorer
- **Schema Diff & Impact Analysis** — Compare schema versions and see which saved queries break
- **Auto-Heal Queries** — Automatically rename or remove fields broken by schema changes
- **Query Cost Estimation** — Predict query complexity based on field count, depth, and list multipliers
- **Security Analysis** — Detect depth attacks, alias abuse, sensitive fields, and missing pagination
- **Performance Tracking** — Track response times with anomaly detection
- **Intent-based Query Generation** — Generate queries from intent keywords (get, list, create, update, delete) with field autocomplete
- **GraphQL Service Detection** — Auto-discover running GraphQL endpoints by scanning workspace ports
- **Editor Tabs** — Open requests in dedicated editor panels with unsaved change tracking
- **Request History** — Automatically track last 50 executed requests
- **Workspace-scoped Storage** — Collections, environments, and history are scoped per workspace
