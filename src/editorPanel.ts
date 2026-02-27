import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { StorageService } from './storage';
import { executeGraphQLQuery } from './graphqlExecutor';
import { calculateQueryCost } from './queryCostCalculator';
import { analyzeQuerySecurity } from './querySecurityAnalyzer';
import { updatePerformanceStats, detectAnomaly } from './performanceTracker';
import { parseNaturalLanguage, generateFromNL, callAIProvider, generateResolverStub } from './nlToGraphql';
import { generateOperationString } from './schemaIntrospector';
import type { GraphQLRequest } from './types';

interface DirtyTab {
  id: string;
  name: string;
  type: string;
  query: string;
  variables: string;
  headers: Record<string, string>;
}

export class EditorPanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private dirtyTabs: DirtyTab[] = [];
  private webviewReady = false;
  private pendingMessages: Array<{ type: string; payload: unknown }> = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: StorageService,
  ) {}

  openRequest(request: GraphQLRequest | { id: string; name: string; type: string; query: string; variables: string; headers: Record<string, string> }): void {
    const enriched = this.enrichRequestWithSchema(request);
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.panel.webview.postMessage({ type: 'openRequest', payload: enriched });
    } else {
      this.createPanel(enriched);
    }
  }

  /** Add returnTypeName, availableFields, operationArgs from schema if missing */
  private enrichRequestWithSchema(
    request: GraphQLRequest | { id: string; name: string; type: string; query: string; variables: string; headers: Record<string, string> },
  ): Record<string, unknown> {
    const req = request as Record<string, unknown>;
    // Skip if already enriched
    if (Array.isArray(req.availableFields) && req.availableFields.length > 0) {
      return req;
    }
    const schema = this.storage.loadSchema();
    if (!schema) return req;

    const query = String(req.query || '');
    // Extract operation type and root field name from query text
    const opMatch = query.match(/^\s*(query|mutation|subscription)\s+\w*\s*(?:\([^)]*\))?\s*\{\s*(\w+)/m);
    if (!opMatch) return req;

    const opType = opMatch[1];
    const fieldName = opMatch[2];
    if (opType !== 'query' && opType !== 'mutation') return req;

    try {
      const generated = generateOperationString(schema, opType, fieldName);
      return {
        ...req,
        returnTypeName: generated.returnTypeName,
        availableFields: generated.availableFields,
        operationArgs: generated.operationArgs,
      };
    } catch {
      return req;
    }
  }

  private createPanel(request: Record<string, unknown>): void {
    this.panel = vscode.window.createWebviewPanel(
      'graphqlClient.editor',
      'GraphQL CLNT',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
      },
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.svg');
    this.panel.webview.html = this.getHtmlContent(this.panel.webview);
    this.webviewReady = false;
    this.pendingMessages = [];
    this.setupMessageHandler(this.panel.webview);

    // Queue the initial request — it will be sent when the webview signals ready
    this.pendingMessages.push({ type: 'openRequest', payload: request });

    this.panel.onDidDispose(async () => {
      if (this.dirtyTabs.length > 0) {
        const names = this.dirtyTabs.map(t => t.name).join(', ');
        const choice = await vscode.window.showWarningMessage(
          `You have unsaved changes in: ${names}`,
          'Save All',
          "Don't Save",
        );
        if (choice === 'Save All') {
          this.saveAllDirtyTabs();
        }
      }
      this.dirtyTabs = [];
      this.panel = undefined;
    });
  }

  private setupMessageHandler(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'webviewReady':
          this.webviewReady = true;
          for (const msg of this.pendingMessages) {
            webview.postMessage(msg);
          }
          this.pendingMessages = [];
          break;

        case 'executeQuery':
          await this.handleExecuteQuery(webview, message.payload);
          break;

        case 'loadEnvironments':
          webview.postMessage({
            type: 'environmentsLoaded',
            payload: this.storage.loadEnvironments(),
          });
          break;

        case 'saveEnvironments':
          this.storage.saveEnvironments(message.payload);
          break;

        case 'loadHistory':
          webview.postMessage({
            type: 'historyLoaded',
            payload: this.storage.loadHistory(),
          });
          break;

        case 'saveHistory':
          this.storage.saveHistory(message.payload);
          break;

        case 'listSecrets':
          webview.postMessage({
            type: 'secretsList',
            payload: this.storage.getSecretKeys(),
          });
          break;

        case 'setSecret':
          await this.storage.setSecret(message.payload.key, message.payload.value);
          webview.postMessage({
            type: 'secretsList',
            payload: this.storage.getSecretKeys(),
          });
          break;

        case 'deleteSecret':
          await this.storage.deleteSecret(message.payload.key);
          webview.postMessage({
            type: 'secretsList',
            payload: this.storage.getSecretKeys(),
          });
          break;

        case 'saveRequest': {
          // Check if request exists in any collection
          const collections = this.storage.loadCollections();
          const exists = collections.some(col =>
            col.folders.some(folder =>
              folder.requests.some(req => req.id === message.payload.requestId)
            )
          );
          if (exists) {
            this.onRequestSaved?.(message.payload);
            webview.postMessage({ type: 'saveConfirmed' });
          } else {
            // Request not in any collection — prompt user to save to collection
            webview.postMessage({ type: 'promptSaveToCollection', payload: collections });
          }
          break;
        }

        case 'saveNewRequest': {
          const { collectionId, folderId, newCollectionName, newFolderName, request } = message.payload;
          let cols = this.storage.loadCollections();

          let targetColId = collectionId;
          let targetFolderId = folderId;

          // Create new collection if needed
          if (!targetColId && newCollectionName) {
            const newCol = {
              id: 'col-' + crypto.randomUUID(),
              name: newCollectionName,
              folders: [],
            };
            cols.push(newCol);
            targetColId = newCol.id;
          }

          // Create new folder if needed
          if (targetColId && !targetFolderId && newFolderName) {
            const newFolder = {
              id: 'folder-' + crypto.randomUUID(),
              name: newFolderName,
              requests: [],
            };
            cols = cols.map(c =>
              c.id === targetColId ? { ...c, folders: [...c.folders, newFolder] } : c
            );
            targetFolderId = newFolder.id;
          }

          // Add request to the target folder
          if (targetColId && targetFolderId) {
            cols = cols.map(c =>
              c.id === targetColId ? {
                ...c,
                folders: c.folders.map(f =>
                  f.id === targetFolderId ? { ...f, requests: [...f.requests, request] } : f
                ),
              } : c
            );
            this.storage.saveCollections(cols);
            this.onNewRequestSaved?.();
            webview.postMessage({ type: 'saveConfirmed' });
          }
          break;
        }

        case 'loadCollections':
          webview.postMessage({
            type: 'collectionsLoaded',
            payload: this.storage.loadCollections(),
          });
          break;

        case 'dirtyState':
          this.dirtyTabs = message.payload;
          break;

        case 'calculateQueryCost': {
          const schema = this.storage.loadSchema();
          const cost = calculateQueryCost(message.payload.query, schema);
          webview.postMessage({ type: 'queryCostResult', payload: cost });
          break;
        }

        case 'nlToGraphql':
          await this.handleNLToGraphql(webview, message.payload);
          break;

        case 'generateResolver':
          this.handleGenerateResolver(webview, message.payload);
          break;

        case 'loadAIConfig': {
          const aiConfig = this.storage.loadAIConfig();
          webview.postMessage({ type: 'aiConfigLoaded', payload: aiConfig ?? null });
          break;
        }

        case 'saveAIConfig':
          this.storage.saveAIConfig(message.payload);
          break;

        case 'loadSharedHeaders':
          webview.postMessage({
            type: 'sharedHeadersLoaded',
            payload: this.storage.loadSharedHeaders(),
          });
          break;

        case 'saveSharedHeaders':
          this.storage.saveSharedHeaders(message.payload);
          break;

        case 'analyzeQuerySecurity': {
          const schema = this.storage.loadSchema();
          const result = analyzeQuerySecurity(message.payload.query, schema);
          webview.postMessage({ type: 'securityResult', payload: result });
          break;
        }

        case 'loadProvenance': {
          const prov = this.storage.loadProvenance(message.payload.requestId);
          if (prov) {
            webview.postMessage({ type: 'provenanceLoaded', payload: prov });
          } else {
            webview.postMessage({ type: 'provenanceLoaded', payload: { requestId: message.payload.requestId, entries: [] } });
          }
          break;
        }

        case 'addProvenanceEntry': {
          const { requestId, entry } = message.payload;
          let provenance = this.storage.loadProvenance(requestId);
          if (!provenance) {
            provenance = { requestId, entries: [] };
          }
          provenance.entries.push(entry);
          const MAX_PROVENANCE_ENTRIES = 100;
          if (provenance.entries.length > MAX_PROVENANCE_ENTRIES) {
            provenance.entries = provenance.entries.slice(-MAX_PROVENANCE_ENTRIES);
          }
          this.storage.saveProvenance(requestId, provenance);
          break;
        }

        case 'loadPerformanceStats': {
          const stats = this.storage.loadPerformanceStats(message.payload.requestId);
          webview.postMessage({ type: 'performanceStatsLoaded', payload: stats ?? null });
          break;
        }

      }
    });
  }

  /** Notify the editor panel that environments changed (e.g. from sidebar) */
  public notifyEnvironmentsChanged(): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'environmentsLoaded',
        payload: this.storage.loadEnvironments(),
      });
    }
  }

  // Callback for when a request is saved from the editor
  public onRequestSaved?: (data: { requestId: string; updates: { query: string; variables: string; headers: Record<string, string> } }) => void;

  // Callback for when a new request is saved to a collection
  public onNewRequestSaved?: () => void;

  private saveAllDirtyTabs(): void {
    const collections = this.storage.loadCollections();
    for (const tab of this.dirtyTabs) {
      const exists = collections.some(col =>
        col.folders.some(folder =>
          folder.requests.some(req => req.id === tab.id)
        )
      );
      if (exists) {
        this.onRequestSaved?.({
          requestId: tab.id,
          updates: { query: tab.query, variables: tab.variables, headers: tab.headers },
        });
      }
    }
  }

  private async handleNLToGraphql(
    webview: vscode.Webview,
    payload: { input: string; mode: 'rule' | 'ai' },
  ): Promise<void> {
    const schema = this.storage.loadSchema();
    if (!schema) {
      webview.postMessage({ type: 'schemaError', payload: { error: 'No schema loaded. Introspect first.' } });
      return;
    }

    try {
      if (payload.mode === 'ai') {
        const config = this.storage.loadAIConfig();
        if (!config) {
          webview.postMessage({ type: 'schemaError', payload: { error: 'AI provider not configured.' } });
          return;
        }
        const apiKey = await this.storage.getSecret(config.apiKeySecret);
        if (!apiKey) {
          webview.postMessage({ type: 'schemaError', payload: { error: `API key secret "${config.apiKeySecret}" not found.` } });
          return;
        }
        const result = await callAIProvider(payload.input, schema, config, apiKey);
        webview.postMessage({ type: 'nlResult', payload: { query: result.query, variables: result.variables } });
      } else {
        const parsed = parseNaturalLanguage(payload.input, schema);
        const result = generateFromNL(parsed, schema);
        webview.postMessage({ type: 'nlResult', payload: { query: result.query, variables: result.variables, returnTypeName: result.returnTypeName, availableFields: result.availableFields, operationArgs: result.operationArgs, warning: result.warning } });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      webview.postMessage({ type: 'schemaError', payload: { error: 'NL generation failed: ' + msg } });
    }
  }

  private handleGenerateResolver(
    webview: vscode.Webview,
    payload: { operationType: 'query' | 'mutation'; fieldName: string },
  ): void {
    const schema = this.storage.loadSchema();
    if (!schema) {
      webview.postMessage({ type: 'schemaError', payload: { error: 'No schema loaded' } });
      return;
    }
    const result = generateResolverStub(schema, payload.operationType, payload.fieldName);
    webview.postMessage({
      type: 'nlResult',
      payload: { query: '', variables: '{}', resolverCode: result.code },
    });
  }

  private async handleExecuteQuery(
    webview: vscode.Webview,
    payload: { query: string; variables: string; headers: Record<string, string>; endpoint: string; requestId?: string },
  ): Promise<void> {
    try {
      const endpoint = await this.storage.resolveSecretsInText(payload.endpoint);
      const resolvedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(payload.headers)) {
        resolvedHeaders[key] = await this.storage.resolveSecretsInText(value);
      }

      const result = await executeGraphQLQuery({
        endpoint,
        query: payload.query,
        variables: payload.variables,
        headers: resolvedHeaders,
      });

      webview.postMessage({ type: 'queryResult', payload: result });

      // Performance tracking (Feature D)
      if (payload.requestId && result.responseTime) {
        const schemaTimestamp = this.storage.loadSchema()?.fetchedAt;
        const existing = this.storage.loadPerformanceStats(payload.requestId);
        const updated = updatePerformanceStats(existing, payload.requestId, result.responseTime, schemaTimestamp);
        this.storage.savePerformanceStats(payload.requestId, updated);

        const anomaly = detectAnomaly(updated, result.responseTime);
        if (anomaly) {
          webview.postMessage({ type: 'performanceAnomaly', payload: anomaly });
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      webview.postMessage({
        type: 'queryError',
        payload: { error: errorMessage, responseTime: 0 },
      });
    }
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'editor.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'editor.js'));

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${cssUri}">
  <title>GraphQL CLNT</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}
