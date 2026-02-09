import * as vscode from 'vscode';
import { StorageService } from './storage';
import { introspectSchema, generateOperationString } from './schemaIntrospector';
import type { Collection } from './types';

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
      }
    });
  }

  private async handleIntrospectSchema(
    webview: vscode.Webview,
    payload: { endpoint: string; headers: Record<string, string> },
  ): Promise<void> {
    webview.postMessage({ type: 'schemaIntrospecting' });

    try {
      // Resolve secrets in endpoint and header values
      const resolvedEndpoint = await this.storage.resolveSecretsInText(payload.endpoint);
      const resolvedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(payload.headers)) {
        resolvedHeaders[key] = await this.storage.resolveSecretsInText(value);
      }

      const schema = await introspectSchema(resolvedEndpoint, resolvedHeaders);
      this.storage.saveSchema(schema);
      webview.postMessage({ type: 'schemaLoaded', payload: schema });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      webview.postMessage({ type: 'schemaError', payload: { error: msg } });
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
  <title>GraphQL Client</title>
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
