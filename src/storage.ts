import * as vscode from 'vscode';
import type { Collection, Environment, HistoryEntry, IntrospectedSchema, ImpactReport, AIProviderConfig, HeaderEntry, RequestProvenance, PerformanceStats } from './types';

const KEYS = {
  collections: 'graphqlClient.collections',
  environments: 'graphqlClient.environments',
  history: 'graphqlClient.history',
  secretKeys: 'graphqlClient.secretKeys',
  schema: 'graphqlClient.schema',
  previousSchema: 'graphqlClient.previousSchema',
  impactReport: 'graphqlClient.impactReport',
  aiConfig: 'graphqlClient.aiConfig',
  sharedHeaders: 'graphqlClient.sharedHeaders',
  migrated: 'graphqlClient.migrated',
  provenance: 'graphqlClient.provenance',
  performanceStats: 'graphqlClient.performanceStats',
} as const;

const MAX_HISTORY = 50;

const DEFAULT_ENVIRONMENT: Environment = {
  active: 'local',
  envs: {
    local: {
      name: 'Local',
      endpoint: '',
      headers: {
        'Content-Type': 'application/json',
      },
    },
  },
};

export class StorageService {
  constructor(
    private readonly globalState: vscode.Memento,
    private readonly secretStorage: vscode.SecretStorage,
    private readonly workspaceState: vscode.Memento,
  ) {}

  /** One-time migration: copy workspace-scoped data from globalState to workspaceState */
  migrateToWorkspace(): void {
    if (this.workspaceState.get<boolean>(KEYS.migrated)) return;

    const collections = this.globalState.get<Collection[]>(KEYS.collections);
    if (collections && collections.length > 0) {
      this.workspaceState.update(KEYS.collections, collections);
    }

    const environments = this.globalState.get<Environment>(KEYS.environments);
    if (environments) {
      this.workspaceState.update(KEYS.environments, environments);
    }

    const history = this.globalState.get<HistoryEntry[]>(KEYS.history);
    if (history && history.length > 0) {
      this.workspaceState.update(KEYS.history, history);
    }

    this.workspaceState.update(KEYS.migrated, true);
  }

  // ── Collections (workspace-scoped) ──

  saveCollections(collections: Collection[]): void {
    this.workspaceState.update(KEYS.collections, collections);
  }

  loadCollections(): Collection[] {
    return this.workspaceState.get<Collection[]>(KEYS.collections) ?? [];
  }

  // ── Environments (workspace-scoped) ──

  saveEnvironments(environments: Environment): void {
    this.workspaceState.update(KEYS.environments, environments);
  }

  loadEnvironments(): Environment {
    return this.workspaceState.get<Environment>(KEYS.environments) ?? DEFAULT_ENVIRONMENT;
  }

  // ── History (workspace-scoped) ──

  saveHistory(history: HistoryEntry[]): void {
    const capped = history.slice(0, MAX_HISTORY);
    this.workspaceState.update(KEYS.history, capped);
  }

  loadHistory(): HistoryEntry[] {
    return this.workspaceState.get<HistoryEntry[]>(KEYS.history) ?? [];
  }

  // ── Schema Cache (workspace-scoped) ──

  saveSchema(schema: IntrospectedSchema): void {
    this.workspaceState.update(KEYS.schema, schema);
  }

  loadSchema(): IntrospectedSchema | undefined {
    return this.workspaceState.get<IntrospectedSchema>(KEYS.schema);
  }

  // ── Previous Schema (for diffing) ──

  savePreviousSchema(schema: IntrospectedSchema): void {
    this.workspaceState.update(KEYS.previousSchema, schema);
  }

  loadPreviousSchema(): IntrospectedSchema | undefined {
    return this.workspaceState.get<IntrospectedSchema>(KEYS.previousSchema);
  }

  // ── Impact Report Cache ──

  saveImpactReport(report: ImpactReport): void {
    this.workspaceState.update(KEYS.impactReport, report);
  }

  loadImpactReport(): ImpactReport | undefined {
    return this.workspaceState.get<ImpactReport>(KEYS.impactReport);
  }

  clearImpactReport(): void {
    this.workspaceState.update(KEYS.impactReport, undefined);
  }

  // ── AI Config ──

  saveAIConfig(config: AIProviderConfig): void {
    this.workspaceState.update(KEYS.aiConfig, config);
  }

  loadAIConfig(): AIProviderConfig | undefined {
    return this.workspaceState.get<AIProviderConfig>(KEYS.aiConfig);
  }

  // ── Provenance (workspace-scoped) ──

  saveProvenance(requestId: string, provenance: RequestProvenance): void {
    const all = this.workspaceState.get<Record<string, RequestProvenance>>(KEYS.provenance) ?? {};
    all[requestId] = provenance;
    this.workspaceState.update(KEYS.provenance, all);
  }

  loadProvenance(requestId: string): RequestProvenance | undefined {
    const all = this.workspaceState.get<Record<string, RequestProvenance>>(KEYS.provenance) ?? {};
    return all[requestId];
  }

  // ── Performance Stats (workspace-scoped) ──

  savePerformanceStats(requestId: string, stats: PerformanceStats): void {
    const all = this.workspaceState.get<Record<string, PerformanceStats>>(KEYS.performanceStats) ?? {};
    all[requestId] = stats;
    this.workspaceState.update(KEYS.performanceStats, all);
  }

  loadPerformanceStats(requestId: string): PerformanceStats | undefined {
    const all = this.workspaceState.get<Record<string, PerformanceStats>>(KEYS.performanceStats) ?? {};
    return all[requestId];
  }

  // ── Shared Headers (global — persists across workspaces) ──

  saveSharedHeaders(entries: HeaderEntry[]): void {
    this.globalState.update(KEYS.sharedHeaders, entries);
  }

  loadSharedHeaders(): HeaderEntry[] {
    return this.globalState.get<HeaderEntry[]>(KEYS.sharedHeaders) ?? [];
  }

  // ── Secrets (global) ──

  async setSecret(key: string, value: string): Promise<void> {
    await this.secretStorage.store(key, value);
    await this.addSecretKey(key);
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.secretStorage.get(key);
  }

  async deleteSecret(key: string): Promise<void> {
    await this.secretStorage.delete(key);
    await this.removeSecretKey(key);
  }

  getSecretKeys(): string[] {
    return this.globalState.get<string[]>(KEYS.secretKeys) ?? [];
  }

  private async addSecretKey(key: string): Promise<void> {
    const keys = this.getSecretKeys();
    if (!keys.includes(key)) {
      keys.push(key);
      await this.globalState.update(KEYS.secretKeys, keys);
    }
  }

  private async removeSecretKey(key: string): Promise<void> {
    const keys = this.getSecretKeys().filter(k => k !== key);
    await this.globalState.update(KEYS.secretKeys, keys);
  }

  // ── Secret Resolution ──

  async resolveSecretsInText(text: string): Promise<string> {
    const pattern = /\$\{secret:([^}]+)\}/g;
    let result = text;
    let match: RegExpExecArray | null;

    const replacements: Array<{ full: string; key: string }> = [];
    while ((match = pattern.exec(text)) !== null) {
      replacements.push({ full: match[0], key: match[1] });
    }

    for (const { full, key } of replacements) {
      const value = await this.getSecret(key);
      result = result.replaceAll(full, value ?? '');
    }

    return result;
  }
}
