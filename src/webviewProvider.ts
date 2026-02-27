import * as vscode from 'vscode';
import { StorageService } from './storage';
import { introspectSchema, generateOperationString } from './schemaIntrospector';
import { diffSchemas, extractFieldsFromQuery } from './schemaDiffer';
import { healQuery } from './queryHealer';
import { parseNaturalLanguage, generateFromNL, callAIProvider, generateResolverStub } from './nlToGraphql';
import { parseSchemaInput } from './sdlParser';
import type { Collection, QueryImpactEntry, ImpactReport, SchemaFieldChange, QueryHealFix } from './types';

/**
 * Sidebar WebviewView — shows only the collection tree.
 * When a request is clicked, it fires the onOpenRequest callback
 * so the extension host can open an editor panel.
 */
export class GraphQLClientViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'graphqlClient.mainView';

  private view?: vscode.WebviewView;

  /** Called when a request is clicked in the sidebar tree */
  public onOpenRequest?: (request: { id: string; name: string; type: string; query: string; variables: string; headers: Record<string, string> }) => void;

  /** Called when environments are changed from the sidebar */
  public onEnvironmentsChanged?: () => void;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: StorageService,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'resources'),
      ],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    this.setupMessageHandler(webviewView.webview);
  }

  /** Called by extension host when a request is saved from the editor panel */
  public notifyCollectionsChanged(): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: 'collectionsLoaded',
        payload: this.storage.loadCollections(),
      });
    }
  }

  /** Re-evaluate impact report after collections change (e.g. query saved/healed) */
  public refreshImpactReport(): void {
    const report = this.storage.loadImpactReport();
    if (!report || !this.view) return;
    const schema = this.storage.loadSchema();
    if (!schema) return;
    const updated = this.buildImpactReport(report.diff, schema);
    this.storage.saveImpactReport(updated);
    this.view.webview.postMessage({ type: 'impactReportReady', payload: updated });
  }

  /** Called by extension host when environments change (e.g. auto-detected endpoint) */
  public notifyEnvironmentsChanged(): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: 'environmentsLoaded',
        payload: this.storage.loadEnvironments(),
      });
    }
  }

  private setupMessageHandler(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'loadCollections':
          webview.postMessage({
            type: 'collectionsLoaded',
            payload: this.storage.loadCollections(),
          });
          break;

        case 'saveCollections':
          this.storage.saveCollections(message.payload);
          break;

        case 'openRequest':
          this.onOpenRequest?.(message.payload);
          break;

        case 'importCollection':
          await this.handleImportCollection(webview);
          break;

        case 'exportCollections':
          await this.handleExportCollections(message.payload);
          break;

        case 'loadEnvironments':
          webview.postMessage({
            type: 'environmentsLoaded',
            payload: this.storage.loadEnvironments(),
          });
          break;

        case 'saveEnvironments':
          this.storage.saveEnvironments(message.payload);
          this.onEnvironmentsChanged?.();
          break;

        case 'introspectSchema':
          await this.handleIntrospectSchema(webview, message.payload);
          break;

        case 'loadSchema': {
          const cached = this.storage.loadSchema();
          if (cached) {
            webview.postMessage({ type: 'schemaLoaded', payload: cached });
          }
          break;
        }

        case 'generateOperation':
          this.handleGenerateOperation(webview, message.payload);
          break;

        case 'loadImpactReport': {
          const report = this.storage.loadImpactReport();
          if (report) {
            webview.postMessage({ type: 'impactReportLoaded', payload: report });
          }
          break;
        }

        case 'autoHealQuery':
          this.handleAutoHealQuery(webview, message.payload);
          break;

        case 'autoHealAll':
          this.handleAutoHealAll(webview, message.payload);
          break;

        case 'nlToGraphql':
          await this.handleNLToGraphql(webview, message.payload);
          break;

        case 'generateResolver':
          this.handleGenerateResolver(webview, message.payload);
          break;

        case 'saveAIConfig':
          this.storage.saveAIConfig(message.payload);
          break;

        case 'loadAIConfig': {
          const aiConfig = this.storage.loadAIConfig();
          webview.postMessage({ type: 'aiConfigLoaded', payload: aiConfig ?? null });
          break;
        }

        case 'previewSchemaImpact':
          this.handlePreviewSchemaImpact(webview, message.payload);
          break;

        case 'preHealAll':
          this.handleAutoHealAll(webview, message.payload);
          break;
      }
    });
  }

  private async handleIntrospectSchema(
    webview: vscode.Webview,
    payload: { endpoint: string; headers: Record<string, string> },
  ): Promise<void> {
    webview.postMessage({ type: 'schemaIntrospecting' });

    try {
      // Save current schema as previous before re-introspecting
      const currentSchema = this.storage.loadSchema();
      if (currentSchema) {
        this.storage.savePreviousSchema(currentSchema);
      }

      // Resolve secrets in endpoint and header values
      const resolvedEndpoint = await this.storage.resolveSecretsInText(payload.endpoint);
      const resolvedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(payload.headers)) {
        resolvedHeaders[key] = await this.storage.resolveSecretsInText(value);
      }

      const schema = await introspectSchema(resolvedEndpoint, resolvedHeaders);
      this.storage.saveSchema(schema);
      webview.postMessage({ type: 'schemaLoaded', payload: schema });

      // Run schema diff and impact analysis if previous schema exists
      const previousSchema = this.storage.loadPreviousSchema();
      if (previousSchema) {
        const diff = diffSchemas(previousSchema, schema);
        if (diff.hasBreakingChanges) {
          const report = this.buildImpactReport(diff, schema);
          this.storage.saveImpactReport(report);
          webview.postMessage({ type: 'impactReportReady', payload: report });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      webview.postMessage({ type: 'schemaError', payload: { error: msg } });
    }
  }

  private buildImpactReport(diff: import('./types').SchemaDiffResult, schema: import('./types').IntrospectedSchema): ImpactReport {
    const collections = this.storage.loadCollections();
    const entries: QueryImpactEntry[] = [];

    for (const col of collections) {
      for (const folder of col.folders) {
        for (const req of folder.requests) {
          const analysis = extractFieldsFromQuery(req.query, schema);
          const brokenFields: SchemaFieldChange[] = [];

          for (const fieldRef of analysis.extractedFields) {
            for (const change of diff.fieldChanges) {
              if (change.fieldName === fieldRef.fieldName &&
                  (!fieldRef.typeName || fieldRef.typeName === change.typeName)) {
                brokenFields.push(change);
              }
            }
          }

          const autoFixAvailable = brokenFields.some(
            f => f.changeType === 'removed' || (f.changeType === 'renamed' && f.suggestedReplacement && f.confidence > 0.7),
          );

          let status: 'broken' | 'affected' | 'safe';
          if (brokenFields.some(f => f.changeType === 'removed' || f.changeType === 'renamed')) {
            status = 'broken';
          } else if (brokenFields.length > 0) {
            status = 'affected';
          } else {
            status = 'safe';
          }

          entries.push({
            requestId: req.id,
            requestName: req.name,
            collectionName: col.name,
            folderName: folder.name,
            status,
            brokenFields,
            autoFixAvailable,
          });
        }
      }
    }

    return {
      timestamp: new Date().toISOString(),
      diff,
      entries,
      brokenCount: entries.filter(e => e.status === 'broken').length,
      affectedCount: entries.filter(e => e.status === 'affected').length,
      safeCount: entries.filter(e => e.status === 'safe').length,
    };
  }

  private handleAutoHealQuery(
    webview: vscode.Webview,
    payload: { requestId: string; collectionId: string; folderId: string; fixes: QueryHealFix[] },
  ): void {
    const collections = this.storage.loadCollections();
    let healed = 0;

    const updated = collections.map(col => ({
      ...col,
      folders: col.folders.map(folder => ({
        ...folder,
        requests: folder.requests.map(req => {
          if (req.id === payload.requestId) {
            const newQuery = healQuery(req.query, payload.fixes);
            if (newQuery !== req.query) healed++;
            return { ...req, query: newQuery };
          }
          return req;
        }),
      })),
    }));

    this.storage.saveCollections(updated);
    this.notifyCollectionsChanged();
    this.refreshImpactReport();
    webview.postMessage({ type: 'autoHealComplete', payload: { healed, total: 1 } });
  }

  private handleAutoHealAll(
    webview: vscode.Webview,
    payload: { entries: Array<{ requestId: string; collectionId: string; folderId: string; fixes: QueryHealFix[] }> },
  ): void {
    let collections = this.storage.loadCollections();
    let healed = 0;

    for (const entry of payload.entries) {
      collections = collections.map(col => ({
        ...col,
        folders: col.folders.map(folder => ({
          ...folder,
          requests: folder.requests.map(req => {
            if (req.id === entry.requestId) {
              const newQuery = healQuery(req.query, entry.fixes);
              if (newQuery !== req.query) healed++;
              return { ...req, query: newQuery };
            }
            return req;
          }),
        })),
      }));
    }

    this.storage.saveCollections(collections);
    this.notifyCollectionsChanged();
    this.refreshImpactReport();
    webview.postMessage({ type: 'autoHealComplete', payload: { healed, total: payload.entries.length } });
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

  private handlePreviewSchemaImpact(
    webview: vscode.Webview,
    payload: { schemaText: string },
  ): void {
    try {
      const parsedSchema = parseSchemaInput(payload.schemaText);
      const currentSchema = this.storage.loadSchema();
      if (!currentSchema) {
        webview.postMessage({ type: 'sdlParseError', payload: { error: 'No current schema loaded. Introspect first.' } });
        return;
      }

      // Merge: start from current schema, overlay only the types the user redefined.
      // This way omitted types aren't treated as "removed".
      const mergedSchema = {
        ...currentSchema,
        queryType: parsedSchema.queryType ?? currentSchema.queryType,
        mutationType: parsedSchema.mutationType ?? currentSchema.mutationType,
        types: { ...currentSchema.types },
        inputTypes: { ...currentSchema.inputTypes },
      };
      for (const [name, type] of Object.entries(parsedSchema.types)) {
        mergedSchema.types[name] = type;
      }
      for (const [name, type] of Object.entries(parsedSchema.inputTypes)) {
        mergedSchema.inputTypes[name] = type;
      }

      const diff = diffSchemas(currentSchema, mergedSchema);
      const report = this.buildImpactReport(diff, mergedSchema);
      webview.postMessage({ type: 'predictedImpactReady', payload: report });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      webview.postMessage({ type: 'sdlParseError', payload: { error: msg } });
    }
  }

  private handleGenerateOperation(
    webview: vscode.Webview,
    payload: { operationType: 'query' | 'mutation'; fieldName: string },
  ): void {
    const schema = this.storage.loadSchema();
    if (!schema) {
      webview.postMessage({ type: 'schemaError', payload: { error: 'No schema loaded' } });
      return;
    }

    try {
      const result = generateOperationString(schema, payload.operationType, payload.fieldName);
      webview.postMessage({ type: 'operationGenerated', payload: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      webview.postMessage({ type: 'schemaError', payload: { error: msg } });
    }
  }

  private async handleImportCollection(webview: vscode.Webview): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON Files': ['json'] },
      title: 'Import GraphQL Collection',
    });

    if (!uris || uris.length === 0) return;

    try {
      const data = await vscode.workspace.fs.readFile(uris[0]);
      const text = Buffer.from(data).toString('utf-8');
      const collections: Collection[] = JSON.parse(text);

      if (!Array.isArray(collections)) {
        throw new Error('Invalid collection format: expected an array');
      }

      webview.postMessage({
        type: 'importedCollections',
        payload: collections,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage('Failed to import collection: ' + msg);
    }
  }

  private async handleExportCollections(collections: Collection[]): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'JSON Files': ['json'] },
      defaultUri: vscode.Uri.file('graphql-collections.json'),
      title: 'Export GraphQL Collections',
    });

    if (!uri) return;

    try {
      const data = Buffer.from(JSON.stringify(collections, null, 2), 'utf-8');
      await vscode.workspace.fs.writeFile(uri, data);
      vscode.window.showInformationMessage('Collections exported successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage('Failed to export collections: ' + msg);
    }
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js'));

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
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
