# Features

Detailed documentation for each feature in the GraphQL Client extension.

---

## Query Execution

Execute GraphQL queries and mutations against any endpoint.

- Sends operations via HTTP POST with `Content-Type: application/json`
- Automatically extracts the operation name from the query text
- Variables are parsed from JSON and included in the request body
- Displays response data, status code, response time, and response size

**Module**: `graphqlExecutor.ts`

---

## Collections & Folders

Organize saved requests into a hierarchical structure.

```
Collection
  └── Folder
        └── Request (name, type, query, variables, headers)
```

- Create, rename, delete collections, folders, and requests
- Click a request in the sidebar to open it in an editor tab
- Import collections from JSON files
- Export collections to JSON files for sharing

**Storage**: `workspaceState` (per-workspace)

---

## Schema Introspection

Fetch and cache the schema from a live GraphQL endpoint.

- Sends the standard introspection query with nested `TypeRef` fragments (6 levels deep)
- Parses the response into an `IntrospectedSchema` with typed fields, arguments, and type references
- Caches the schema in workspace storage for offline use
- Supports manual schema input via SDL text or JSON introspection result

**Modules**: `schemaIntrospector.ts`, `sdlParser.ts`

---

## Schema Explorer & Operation Generation

Browse the introspected schema and generate operations from it.

- View all types, fields, and their arguments
- Click a field to generate a ready-to-run query or mutation
- Generated operations include:
  - Variable declarations matching field arguments
  - Default variable values based on argument types
  - Selection set with scalar fields (depth-limited, cycle-safe)
  - Available fields metadata for the field picker

**Module**: `schemaIntrospector.ts` (`generateOperationString`)

---

## Schema Diff & Impact Analysis

Compare schema versions and identify breaking changes.

When a schema is re-introspected, the extension:

1. **Diffs** the old and new schemas, detecting:
   - Added / removed types
   - Removed / renamed fields (with Levenshtein similarity matching)
   - Type changes on existing fields
   - Argument changes

2. **Scans all saved queries** against the diff to produce an impact report:
   - **Broken** — query uses a removed or renamed field
   - **Affected** — query uses a field with changed type or args
   - **Safe** — query is unaffected

3. **Reports** a summary: `3 broken, 2 affected, 15 safe`

**Modules**: `schemaDiffer.ts` (`diffSchemas`, `extractFieldsFromQuery`)

---

## Schema Impact Preview

Predict the impact of a future schema change before deploying it.

- Paste SDL or JSON representing proposed schema changes
- The extension merges the proposed changes with the current schema (only redefines overlapping types — omitted types are kept)
- Runs the same diff + impact analysis pipeline
- Shows a "predicted" impact report without affecting the saved schema

**Module**: `sdlParser.ts`, `schemaDiffer.ts`

---

## Auto-Heal Queries

Automatically fix queries broken by schema changes.

Supports two fix types:
- **Rename** — replace `oldFieldName` with `newFieldName` (confidence > 0.7)
- **Remove** — delete the broken field and its sub-selection block

Heal modes:
- **Single query** — fix one query at a time
- **Heal all** — batch-fix all broken queries in one action

Alias-aware: preserves `alias: fieldName` syntax during renames.

**Module**: `queryHealer.ts` (`healQuery`, `extractAutoFixes`)

---

## Query Cost Estimation

Predict query complexity before execution.

Cost formula:
```
totalCost = fieldCount × 1
           + listFieldCount × 10
           + nestedListCount × 100
           + depthPenalty (if depth > 3: (depth - 3)² × 5)
```

Risk levels:
| Cost | Level |
|------|-------|
| < 50 | Low |
| 50–199 | Medium |
| 200–499 | High |
| 500+ | Critical |

Returns a breakdown with explanation strings for each component.

**Module**: `queryCostCalculator.ts`

---

## Security Analysis

Scan queries for potential security issues.

| Rule | Severity | Trigger |
|------|----------|---------|
| `depth-attack` | Critical | Depth > 5 |
| `depth-attack` | Warning | Depth 4–5 |
| `circular-reference` | Warning | Same type appears multiple times in query path |
| `sensitive-field` | Warning | Field name matches `password`, `secret`, `token`, `apiKey`, etc. |
| `alias-abuse` | Critical | 3+ aliases for the same field name |
| `missing-pagination` | Info | List field without `first`/`limit`/`take` argument |

Scoring: starts at 100, deducts 30 per critical, 15 per warning, 5 per info.

| Score | Level |
|-------|-------|
| 70+ | Safe |
| 40–69 | Warning |
| < 40 | Unsafe |

**Module**: `querySecurityAnalyzer.ts`

---

## Performance Tracking

Track response times over time and detect performance anomalies.

Uses **Welford's online algorithm** for computing running mean and standard deviation without storing individual data points:

```
newAvg = oldAvg + (value - oldAvg) / count
sumSquaredDiff += (value - oldAvg) * (value - newAvg)
variance = sumSquaredDiff / (count - 1)
stddev = sqrt(variance)
```

**Anomaly detection**: flags when the latest response time exceeds **2x the rolling average** (requires 3+ data points).

**Schema correlation**: if an anomaly is detected and the schema was updated within the last 24 hours, a correlation message is included.

**Module**: `performanceTracker.ts`

---

## Natural Language to GraphQL

Describe what you want in plain English and get a generated query.

1. **Intent detection** — scans for verbs: `get`, `list`, `create`, `update`, `delete`
2. **Entity matching** — matches tokens to root field names (priority) then type names (fallback), using exact match, plural stripping, substring, and fuzzy Levenshtein matching
3. **Field hints** — matches remaining tokens to fields on the matched type
4. **Filter extraction** — parses `where X is Y` / `with X equals Y` patterns
5. **Query generation** — builds a complete operation with variables, arguments, and selection set

**Module**: `nlToGraphql.ts`

---

## GraphQL Service Auto-Detection

Automatically discover running GraphQL endpoints on activation.

1. Scans workspace `package.json` files for port hints (`--port`, `PORT=`, `localhost:`)
2. Probes candidate ports (hint ports + common: 4000, 3000, 8080, 5000, 8000) on common paths (`/graphql`, `/api/graphql`)
3. Validates by sending `{ __typename }` and checking for a valid GraphQL response
4. If found, sets the active environment endpoint automatically
5. If not found, prompts the user for a URL

**Module**: `serviceDetector.ts`

---

## Query Provenance

Track the history of how a query was created and modified.

Each provenance entry records:
- **Timestamp**
- **Action**: `created`, `field-added`, `field-removed`, `auto-healed`, `manual-edit`, `variables-changed`
- **Origin**: `nl-input`, `schema-explorer`, `manual`, `import`
- **Detail**: human-readable description
- **Query snapshot**: optional snapshot of the query at that point

Capped at 100 entries per request.

**Storage**: `workspaceState` (per-workspace)
