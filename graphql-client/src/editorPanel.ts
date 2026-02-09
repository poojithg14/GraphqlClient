import * as vscode from 'vscode';
import { StorageService } from './storage';
import { executeGraphQLQuery } from './graphqlExecutor';
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

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: StorageService,
  ) {}

  openRequest(request: GraphQLRequest | { id: string; name: string; type: string; query: string; variables: string; headers: Record<string, string> }): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.panel.webview.postMessage({ type: 'openRequest', payload: request });
    } else {
      this.createPanel(request);
    }
  }

  private createPanel(request: GraphQLRequest | { id: string; name: string; type: string; query: string; variables: string; headers: Record<string, string> }): void {
    this.panel = vscode.window.createWebviewPanel(
      'graphqlClient.editor',
      'GraphQL Client',
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
    this.setupMessageHandler(this.panel.webview);

    // Send initial request after a short delay so the webview JS has loaded
    setTimeout(() => {
      this.panel?.webview.postMessage({ type: 'openRequest', payload: request });
    }, 100);

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
              id: 'col-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
              name: newCollectionName,
              folders: [],
            };
            cols.push(newCol);
            targetColId = newCol.id;
          }

          // Create new folder if needed
          if (targetColId && !targetFolderId && newFolderName) {
            const newFolder = {
              id: 'folder-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
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
      }
    });
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

  private async handleExecuteQuery(
    webview: vscode.Webview,
    payload: { query: string; variables: string; headers: Record<string, string>; endpoint: string },
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
