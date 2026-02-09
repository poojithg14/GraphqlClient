import * as vscode from 'vscode';
import { GraphQLClientViewProvider } from './webviewProvider';
import { EditorPanelManager } from './editorPanel';
import { StorageService } from './storage';
import { detectGraphQLEndpoint } from './serviceDetector';

export function activate(context: vscode.ExtensionContext): void {
  const storage = new StorageService(context.globalState, context.secrets, context.workspaceState);
  storage.migrateToWorkspace();

  const editorPanel = new EditorPanelManager(context.extensionUri, storage);
  const sidebarProvider = new GraphQLClientViewProvider(context.extensionUri, storage);

  // When a request is clicked in the sidebar, open it in the editor panel
  sidebarProvider.onOpenRequest = (request) => {
    editorPanel.openRequest(request);
  };

  // When a request is saved from the editor, update collections and refresh sidebar
  editorPanel.onRequestSaved = (data) => {
    const collections = storage.loadCollections();
    const updated = collections.map(col => ({
      ...col,
      folders: col.folders.map(folder => ({
        ...folder,
        requests: folder.requests.map(req =>
          req.id === data.requestId ? { ...req, ...data.updates } : req
        ),
      })),
    }));
    storage.saveCollections(updated);
    sidebarProvider.notifyCollectionsChanged();
  };

  // When a new request is saved to a collection from the editor
  editorPanel.onNewRequestSaved = () => {
    sidebarProvider.notifyCollectionsChanged();
  };

  // Auto-detect GraphQL endpoint
  detectGraphQLEndpoint().then(detected => {
    if (detected) {
      const envs = storage.loadEnvironments();
      const activeEnv = envs.envs[envs.active];
      if (activeEnv && !activeEnv.endpoint) {
        activeEnv.endpoint = detected;
        storage.saveEnvironments(envs);
        sidebarProvider.notifyEnvironmentsChanged();
      }
    }
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GraphQLClientViewProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('graphqlClient.open', () => {
      vscode.commands.executeCommand('graphqlClient.mainView.focus');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('graphqlClient.importCollection', () => {
      vscode.commands.executeCommand('graphqlClient.mainView.focus');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('graphqlClient.exportCollections', () => {
      vscode.commands.executeCommand('graphqlClient.mainView.focus');
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
