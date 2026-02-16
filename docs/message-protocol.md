# Message Protocol

The extension uses VS Code's `postMessage` API for communication between webviews and the Extension Host. All messages are typed using union types defined in `src/types.ts`.

## Direction

```
Webview ──── WebviewMessage ────► Extension Host
Webview ◄─── ExtensionMessage ─── Extension Host
```

## Webview → Extension Messages

Messages sent from the sidebar or editor webview to the Extension Host.

### Collections

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `loadCollections` | — | Request saved collections |
| `saveCollections` | `Collection[]` | Persist collections |
| `importCollection` | — | Open file dialog to import JSON |
| `exportCollections` | `Collection[]` | Save dialog to export JSON |

### Environments

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `loadEnvironments` | — | Request environment config |
| `saveEnvironments` | `Environment` | Persist environment config |

### Query Execution

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `executeQuery` | `{ query, variables, headers, endpoint, requestId? }` | Execute a GraphQL operation |

### Schema

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `introspectSchema` | `{ endpoint, headers }` | Fetch schema from endpoint |
| `loadSchema` | — | Load cached schema |
| `generateOperation` | `{ operationType, fieldName }` | Generate a query/mutation from schema |
| `previewSchemaImpact` | `{ schemaText }` | Predict impact of schema changes |

### History

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `loadHistory` | — | Load execution history |
| `saveHistory` | `HistoryEntry[]` | Save execution history |

### Save Requests

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `saveRequest` | `{ requestId, updates }` | Update an existing saved request |
| `saveNewRequest` | `{ collectionId, folderId, newCollectionName, newFolderName, request }` | Save to a new or existing collection/folder |

### Analysis

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `calculateQueryCost` | `{ query }` | Get cost estimation |
| `analyzeQuerySecurity` | `{ query }` | Get security analysis |
| `loadPerformanceStats` | `{ requestId }` | Load performance history |

### Impact & Healing

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `loadImpactReport` | — | Load cached impact report |
| `autoHealQuery` | `{ requestId, collectionId, folderId, fixes }` | Heal a single query |
| `autoHealAll` | `{ entries: [...] }` | Heal all broken queries |
| `preHealAll` | `{ entries: [...] }` | Preview heal results |

### NL

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `nlToGraphql` | `{ input, mode }` | Generate query from natural language |

### Headers & Provenance

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `loadSharedHeaders` | — | Load global shared headers |
| `saveSharedHeaders` | `HeaderEntry[]` | Save global shared headers |
| `loadProvenance` | `{ requestId }` | Load query change history |
| `addProvenanceEntry` | `{ requestId, entry }` | Record a query change |

---

## Extension → Webview Messages

Messages sent from the Extension Host back to the webview.

### Data Responses

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `queryResult` | `{ data, responseTime, statusCode?, responseSize? }` | Successful query result |
| `queryError` | `{ error, responseTime }` | Query execution error |
| `collectionsLoaded` | `Collection[]` | Collections data |
| `environmentsLoaded` | `Environment` | Environment config |
| `historyLoaded` | `HistoryEntry[]` | Execution history |
| `sharedHeadersLoaded` | `HeaderEntry[]` | Global shared headers |

### Schema

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `schemaLoaded` | `IntrospectedSchema` | Introspected schema data |
| `schemaError` | `{ error }` | Schema operation error |
| `schemaIntrospecting` | — | Introspection in progress indicator |
| `operationGenerated` | `{ name, type, query, variables, returnTypeName, availableFields, operationArgs }` | Generated operation from schema |

### Analysis Results

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `queryCostResult` | `QueryCostBreakdown` | Cost estimation result |
| `securityResult` | `SecurityAnalysisResult` | Security analysis result |
| `performanceAnomaly` | `PerformanceAnomaly` | Detected performance anomaly |
| `performanceStatsLoaded` | `PerformanceStats \| null` | Performance history |

### Impact & Healing

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `impactReportReady` | `ImpactReport` | New impact report (from introspection) |
| `impactReportLoaded` | `ImpactReport` | Cached impact report |
| `predictedImpactReady` | `ImpactReport` | Predicted impact from SDL preview |
| `autoHealComplete` | `{ healed, total }` | Heal operation result |
| `sdlParseError` | `{ error }` | SDL parsing failure |

### Save & Import

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `saveConfirmed` | — | Save operation succeeded |
| `promptSaveToCollection` | `Collection[]` | Prompt user to choose save location |
| `importedCollections` | `Collection[]` | Imported collection data |
| `exportDone` | — | Export completed |

### NL

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `nlResult` | `{ query, variables, returnTypeName?, availableFields?, operationArgs?, warning? }` | Generated query from NL input |

### Provenance

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `provenanceLoaded` | `RequestProvenance` | Query change history |
