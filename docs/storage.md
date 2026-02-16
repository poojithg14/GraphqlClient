# Storage Model

The extension uses two VS Code storage mechanisms for different data categories.

## Storage Layers

```
┌─────────────────────────────────────────┐
│              StorageService             │
│                                         │
│  ┌───────────────┐  ┌──────────────┐    │
│  │ workspaceState│  │  globalState │    │
│  │               │  │              │    │
│  │ Per-workspace │  │   Global     │    │
│  │ (isolated)    │  │ (shared)     │    │
│  └───────────────┘  └──────────────┘    │
└─────────────────────────────────────────┘
```

### workspaceState (per-workspace, isolated)

Data scoped to the current VS Code workspace. Opening a different workspace shows different data.

| Key | Type | Description |
|-----|------|-------------|
| `graphqlClient.collections` | `Collection[]` | Saved request collections |
| `graphqlClient.environments` | `Environment` | Environment configs (endpoints, headers) |
| `graphqlClient.history` | `HistoryEntry[]` | Execution history (capped at 50) |
| `graphqlClient.schema` | `IntrospectedSchema` | Cached introspected schema |
| `graphqlClient.previousSchema` | `IntrospectedSchema` | Previous schema (for diffing) |
| `graphqlClient.impactReport` | `ImpactReport` | Cached schema impact report |
| `graphqlClient.provenance` | `Record<string, RequestProvenance>` | Query change history per request |
| `graphqlClient.performanceStats` | `Record<string, PerformanceStats>` | Response time stats per request |
| `graphqlClient.migrated` | `boolean` | One-time migration flag |

### globalState (global, shared across workspaces)

Data shared across all VS Code workspaces.

| Key | Type | Description |
|-----|------|-------------|
| `graphqlClient.sharedHeaders` | `HeaderEntry[]` | Default headers applied to all requests |

## Migration

On first activation with a workspace, the extension runs a one-time migration:

1. Checks if `workspaceState` has `graphqlClient.migrated = true`
2. If not, copies collections, environments, and history from `globalState` to `workspaceState`
3. Sets the migration flag

This ensures backward compatibility with older versions that stored everything globally.

## Data Models

### Collection

```typescript
interface Collection {
  id: string;
  name: string;
  folders: Folder[];
  environment?: string;
}

interface Folder {
  id: string;
  name: string;
  requests: GraphQLRequest[];
}

interface GraphQLRequest {
  id: string;
  name: string;
  type: 'query' | 'mutation' | 'subscription';
  query: string;
  variables: string;
  headers: Record<string, string>;
}
```

### Environment

```typescript
interface Environment {
  active: string;                        // key of the active environment
  envs: Record<string, EnvironmentConfig>;
}

interface EnvironmentConfig {
  name: string;
  endpoint: string;
  headers: Record<string, string>;
}
```

Default environment on first use:

```json
{
  "active": "local",
  "envs": {
    "local": {
      "name": "Local",
      "endpoint": "",
      "headers": { "Content-Type": "application/json" }
    }
  }
}
```

### IntrospectedSchema

```typescript
interface IntrospectedSchema {
  queryType: SchemaObjectType | null;
  mutationType: SchemaObjectType | null;
  types: Record<string, SchemaObjectType>;
  inputTypes: Record<string, SchemaObjectType>;
  fetchedAt: string;     // ISO timestamp
  endpoint: string;
}
```

### HistoryEntry

```typescript
interface HistoryEntry {
  id: number;
  requestId: string;
  requestName: string;
  query: string;
  variables: Record<string, unknown>;
  response: unknown;
  responseTime: number;
  timestamp: string;
  environment: string;
  success: boolean;
}
```

History is capped at **50 entries** to prevent unbounded storage growth.

### PerformanceStats

```typescript
interface PerformanceStats {
  requestId: string;
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  sumSquaredDiff: number;     // Welford's running sum
  stddev: number;
  lastResponseTime: number;
  lastTimestamp: string;
  lastSchemaChangeTimestamp?: string;
}
```

Uses Welford's online algorithm — no raw data points are stored, only running statistics.
