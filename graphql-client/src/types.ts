// ── Data Models ──

export interface GraphQLRequest {
  id: string;
  name: string;
  type: 'query' | 'mutation' | 'subscription';
  query: string;
  variables: string;
  headers: Record<string, string>;
}

export interface Folder {
  id: string;
  name: string;
  requests: GraphQLRequest[];
}

export interface Collection {
  id: string;
  name: string;
  folders: Folder[];
}

export interface EnvironmentConfig {
  name: string;
  endpoint: string;
  headers: Record<string, string>;
}

export interface Environment {
  active: string;
  envs: Record<string, EnvironmentConfig>;
}

export interface HistoryEntry {
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

// ── Schema Introspection ──

export interface SchemaTypeRef {
  kind: 'SCALAR' | 'OBJECT' | 'LIST' | 'NON_NULL' | 'ENUM' | 'INPUT_OBJECT' | 'INTERFACE' | 'UNION';
  name: string | null;
  ofType: SchemaTypeRef | null;
}

export interface SchemaArgument {
  name: string;
  type: SchemaTypeRef;
  defaultValue: string | null;
}

export interface SchemaField {
  name: string;
  description: string | null;
  args: SchemaArgument[];
  type: SchemaTypeRef;
}

export interface SchemaObjectType {
  name: string;
  fields: SchemaField[];
}

export interface IntrospectedSchema {
  queryType: SchemaObjectType | null;
  mutationType: SchemaObjectType | null;
  types: Record<string, SchemaObjectType>;
  inputTypes: Record<string, SchemaObjectType>;
  fetchedAt: string;
  endpoint: string;
}

// ── Webview → Extension Messages ──

export type WebviewMessage =
  | { type: 'executeQuery'; payload: { query: string; variables: string; headers: Record<string, string>; endpoint: string } }
  | { type: 'saveCollections'; payload: Collection[] }
  | { type: 'loadCollections' }
  | { type: 'saveEnvironments'; payload: Environment }
  | { type: 'loadEnvironments' }
  | { type: 'setSecret'; payload: { key: string; value: string } }
  | { type: 'getSecret'; payload: { key: string } }
  | { type: 'listSecrets' }
  | { type: 'deleteSecret'; payload: { key: string } }
  | { type: 'saveHistory'; payload: HistoryEntry[] }
  | { type: 'loadHistory' }
  | { type: 'importCollection' }
  | { type: 'exportCollections'; payload: Collection[] }
  | { type: 'resolveSecrets'; payload: { texts: Record<string, string> } }
  | { type: 'introspectSchema'; payload: { endpoint: string; headers: Record<string, string> } }
  | { type: 'loadSchema' }
  | { type: 'generateOperation'; payload: { operationType: 'query' | 'mutation'; fieldName: string } }
  | { type: 'saveRequest'; payload: { requestId: string; updates: { query: string; variables: string; headers: Record<string, string> } } }
  | { type: 'saveNewRequest'; payload: { collectionId: string; folderId: string; newCollectionName: string; newFolderName: string; request: { id: string; name: string; type: 'query' | 'mutation' | 'subscription'; query: string; variables: string; headers: Record<string, string> } } };

// ── Extension → Webview Messages ──

export type ExtensionMessage =
  | { type: 'queryResult'; payload: { data: unknown; responseTime: number } }
  | { type: 'queryError'; payload: { error: string; responseTime: number } }
  | { type: 'collectionsLoaded'; payload: Collection[] }
  | { type: 'environmentsLoaded'; payload: Environment }
  | { type: 'secretsList'; payload: string[] }
  | { type: 'secretValue'; payload: { key: string; value: string } }
  | { type: 'historyLoaded'; payload: HistoryEntry[] }
  | { type: 'importedCollections'; payload: Collection[] }
  | { type: 'exportDone' }
  | { type: 'secretsResolved'; payload: Record<string, string> }
  | { type: 'schemaLoaded'; payload: IntrospectedSchema }
  | { type: 'schemaError'; payload: { error: string } }
  | { type: 'schemaIntrospecting' }
  | { type: 'operationGenerated'; payload: { name: string; type: 'query' | 'mutation'; query: string; variables: string; returnTypeName: string | null; availableFields: Array<{ name: string; type: string; hasSubFields: boolean }>; operationArgs: Array<{ name: string; type: string; required: boolean; defaultValue: string | null }> } }
  | { type: 'promptSaveToCollection'; payload: Collection[] }
  | { type: 'saveConfirmed' };
