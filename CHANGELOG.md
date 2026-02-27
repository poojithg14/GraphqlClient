# Changelog

## [0.4.0] - 2026-02-15

### Added
- **Unit tests** — 138 tests across 11 modules using Vitest
- **CI pipeline** — GitHub Actions workflow running lint, test, and build on Node 18/20/22
- **Documentation** — Architecture overview, feature reference, message protocol, and storage model docs in `docs/`

### Changed
- Project restructured from `graphql-client/` subdirectory to repository root
- README rewritten with badges, accurate feature list, project structure, and documentation links
- Feature documentation updated to reflect only UI-enabled features

## [0.3.0] - 2026-02-08

### Added
- **Save prompt on tab close** — closing a tab with unsaved changes now shows a "Save changes to {name}?" dialog with Save, Don't Save, and Cancel options
- **Save prompt on panel close** — closing the entire GraphQL CLNT panel prompts to save all unsaved tabs via a VS Code native warning dialog with Save All / Don't Save
- **Dirty state tracking** — tabs are tracked as dirty when query, variables, or headers differ from their original values at open time
- **Dirty tab indicator** — a dot indicator appears on tabs with unsaved changes

### Authors
- Poojith Gavini
- Sujjad Ali Mohammad
- Dinesh Bukya
- Ganesh Pinjala
- Kanishuk Reddy Lingareddy Gari
- Nithish Japala

## [0.2.0] - 2026-02-07

### Added
- **Schema Introspection** — fetch and browse your GraphQL schema from the sidebar
  - Collapsible Queries and Mutations tree with field count badges
  - Click any field to auto-generate a complete operation with variables, arguments, and nested selection sets (depth 2, cycle-safe)
  - Loading, error, and empty states in the Schema Explorer UI
  - Schema is cached per workspace for instant reload on reopen
- **Project-based storage** — collections, environments, and history are now scoped per workspace instead of shared globally
  - One-time automatic migration from global to workspace storage on first activation

### Changed
- `StorageService` now takes `workspaceState` as a third constructor parameter
- Collections, environments, and history read/write against `workspaceState` instead of `globalState`

## [0.1.0] - Initial Release

### Added
- Sidebar collection tree with folders and requests
- Editor panel with query editor, variables, headers, and response viewer
- Import/export collections as JSON
- Request history (last 50 entries)
- Smart query template generation from request names
- Syntax highlighting in query preview
- Right-click context menus for rename, duplicate, delete
