// ── Data Models ──

export interface HeaderEntry {
  key: string;
  value: string;
  enabled: boolean;
}

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
  environment?: string;
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

// ── Available Field (recursive, for field picker) ──

export interface AvailableField {
  name: string;
  type: string;
  hasSubFields: boolean;
  subFields?: AvailableField[];
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
  | { type: 'executeQuery'; payload: { query: string; variables: string; headers: Record<string, string>; endpoint: string; requestId?: string } }
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
  | { type: 'saveNewRequest'; payload: { collectionId: string; folderId: string; newCollectionName: string; newFolderName: string; request: { id: string; name: string; type: 'query' | 'mutation' | 'subscription'; query: string; variables: string; headers: Record<string, string> } } }
  | { type: 'calculateQueryCost'; payload: { query: string } }
  | { type: 'loadImpactReport' }
  | { type: 'autoHealQuery'; payload: { requestId: string; collectionId: string; folderId: string; fixes: QueryHealFix[] } }
  | { type: 'autoHealAll'; payload: { entries: Array<{ requestId: string; collectionId: string; folderId: string; fixes: QueryHealFix[] }> } }
  | { type: 'nlToGraphql'; payload: { input: string; mode: 'rule' | 'ai' } }
  | { type: 'generateResolver'; payload: { operationType: 'query' | 'mutation'; fieldName: string } }
  | { type: 'saveAIConfig'; payload: AIProviderConfig }
  | { type: 'loadAIConfig' }
  | { type: 'loadSharedHeaders' }
  | { type: 'saveSharedHeaders'; payload: HeaderEntry[] }
  | { type: 'analyzeQuerySecurity'; payload: { query: string } }
  | { type: 'loadProvenance'; payload: { requestId: string } }
  | { type: 'addProvenanceEntry'; payload: { requestId: string; entry: ProvenanceEntry } }
  | { type: 'previewSchemaImpact'; payload: { schemaText: string } }
  | { type: 'preHealAll'; payload: { entries: Array<{ requestId: string; collectionId: string; folderId: string; fixes: QueryHealFix[] }> } }
  | { type: 'loadPerformanceStats'; payload: { requestId: string } };

// ── Extension → Webview Messages ──

export type ExtensionMessage =
  | { type: 'queryResult'; payload: { data: unknown; responseTime: number; statusCode?: number; responseSize?: number } }
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
  | { type: 'operationGenerated'; payload: { name: string; type: 'query' | 'mutation'; query: string; variables: string; returnTypeName: string | null; availableFields: AvailableField[]; operationArgs: Array<{ name: string; type: string; required: boolean; defaultValue: string | null }> } }
  | { type: 'promptSaveToCollection'; payload: Collection[] }
  | { type: 'saveConfirmed' }
  | { type: 'queryCostResult'; payload: QueryCostBreakdown }
  | { type: 'impactReportReady'; payload: ImpactReport }
  | { type: 'impactReportLoaded'; payload: ImpactReport }
  | { type: 'autoHealComplete'; payload: { healed: number; total: number } }
  | { type: 'nlResult'; payload: { query: string; variables: string; resolverCode?: string; returnTypeName?: string | null; availableFields?: AvailableField[]; operationArgs?: Array<{ name: string; type: string; required: boolean; defaultValue: string | null }>; warning?: string } }
  | { type: 'aiConfigLoaded'; payload: AIProviderConfig | null }
  | { type: 'sharedHeadersLoaded'; payload: HeaderEntry[] }
  | { type: 'securityResult'; payload: SecurityAnalysisResult }
  | { type: 'provenanceLoaded'; payload: RequestProvenance }
  | { type: 'predictedImpactReady'; payload: ImpactReport }
  | { type: 'sdlParseError'; payload: { error: string } }
  | { type: 'performanceAnomaly'; payload: PerformanceAnomaly }
  | { type: 'performanceStatsLoaded'; payload: PerformanceStats | null };

// ── Schema Diff ──

export interface SchemaFieldChange {
  typeName: string;
  fieldName: string;
  changeType: 'removed' | 'renamed' | 'type_changed' | 'args_changed';
  suggestedReplacement: string | null;
  confidence: number;
}

export interface SchemaDiffResult {
  addedTypes: string[];
  removedTypes: string[];
  fieldChanges: SchemaFieldChange[];
  hasBreakingChanges: boolean;
  summary: string;
}

// ── Query Analysis ──

export interface ExtractedFieldRef {
  path: string[];
  typeName: string;
  fieldName: string;
  lineNumber: number;
  aliasOf?: string;
}

export interface QueryAnalysis {
  operationType: string;
  rootFieldName: string;
  extractedFields: ExtractedFieldRef[];
  maxDepth: number;
  listFieldPaths: string[][];
  variableDefinitions: Array<{ name: string; type: string }>;
}

// ── Impact Analysis ──

export interface QueryImpactEntry {
  requestId: string;
  requestName: string;
  collectionName: string;
  folderName: string;
  status: 'broken' | 'affected' | 'safe';
  brokenFields: SchemaFieldChange[];
  autoFixAvailable: boolean;
}

export interface ImpactReport {
  timestamp: string;
  diff: SchemaDiffResult;
  entries: QueryImpactEntry[];
  brokenCount: number;
  affectedCount: number;
  safeCount: number;
}

// ── Query Cost Prediction ──

export interface QueryCostBreakdown {
  totalCost: number;
  fieldCount: number;
  maxDepth: number;
  listMultiplier: number;
  depthPenalty: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  explanation: string[];
}

// ── NL to GraphQL ──

export interface NLParseResult {
  intent: 'get' | 'list' | 'create' | 'update' | 'delete' | 'unknown';
  entityName: string;
  fieldHints: string[];
  filters: Array<{ field: string; value: string }>;
  confidence: number;
}

export interface GeneratedResolver {
  code: string;
  language: string;
  operationType: string;
  fieldName: string;
}

// ── Query Provenance (Feature A) ──

export interface ProvenanceEntry {
  timestamp: string;
  action: 'created' | 'field-added' | 'field-removed' | 'auto-healed' | 'manual-edit' | 'variables-changed';
  origin?: 'nl-input' | 'schema-explorer' | 'manual' | 'import';
  detail: string;
  querySnapshot?: string;
  fieldName?: string;
}

export interface RequestProvenance {
  requestId: string;
  entries: ProvenanceEntry[];
}

// ── Query Security (Feature C) ──

export type SecurityLevel = 'safe' | 'warning' | 'unsafe';

export interface SecurityIssue {
  rule: 'depth-attack' | 'circular-reference' | 'sensitive-field' | 'alias-abuse' | 'missing-pagination';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  fieldPath?: string;
}

export interface SecurityAnalysisResult {
  level: SecurityLevel;
  score: number;
  issues: SecurityIssue[];
  summary: string;
}

// ── Performance Anomaly Detection (Feature D) ──

export interface PerformanceStats {
  requestId: string;
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  sumSquaredDiff: number;
  stddev: number;
  lastResponseTime: number;
  lastTimestamp: string;
  lastSchemaChangeTimestamp?: string;
}

export interface PerformanceAnomaly {
  requestId: string;
  latestTime: number;
  avgTime: number;
  ratio: number;
  message: string;
  schemaCorrelation: boolean;
  schemaCorrelationMessage?: string;
}

// ── Cross-Environment Diffing ──

export interface EnvExecutionResult {
  envKey: string;
  envName: string;
  endpoint: string;
  data: unknown;
  responseTime: number;
  error?: string;
  success: boolean;
}

export interface DiffNode {
  path: string;
  type: 'added' | 'removed' | 'changed' | 'same';
  leftValue?: unknown;
  rightValue?: unknown;
  children?: DiffNode[];
}

export interface CrossEnvDiffResult {
  results: EnvExecutionResult[];
  diffs: Array<{ leftEnv: string; rightEnv: string; nodes: DiffNode[] }>;
}

// ── AI Provider Config ──

export interface AIProviderConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKeySecret: string;
}

// ── Query Heal Fix ──

export interface QueryHealFix {
  oldField: string;
  newField: string;
  lineNumber: number;
}
