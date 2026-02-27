import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../src/storage';

/**
 * In-memory mock for vscode.Memento.
 * Implements get/update with a simple Map.
 */
function createMockMemento(): { get<T>(key: string, defaultValue?: T): T | undefined; update(key: string, value: unknown): void; keys(): readonly string[] } {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      return (store.has(key) ? store.get(key) : defaultValue) as T | undefined;
    },
    update(key: string, value: unknown): void {
      store.set(key, value);
    },
    keys(): readonly string[] {
      return [...store.keys()];
    },
  };
}

/**
 * In-memory mock for vscode.SecretStorage.
 * Implements get/store/delete with a Map.
 */
function createMockSecretStorage(): { get(key: string): Promise<string | undefined>; store(key: string, value: string): Promise<void>; delete(key: string): Promise<void>; onDidChange: unknown } {
  const store = new Map<string, string>();
  return {
    async get(key: string): Promise<string | undefined> {
      return store.get(key);
    },
    async store(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    onDidChange: undefined,
  };
}

describe('StorageService', () => {
  let globalState: ReturnType<typeof createMockMemento>;
  let secretStorage: ReturnType<typeof createMockSecretStorage>;
  let workspaceState: ReturnType<typeof createMockMemento>;
  let service: StorageService;

  beforeEach(() => {
    globalState = createMockMemento();
    secretStorage = createMockSecretStorage();
    workspaceState = createMockMemento();
    service = new StorageService(
      globalState as never,
      secretStorage as never,
      workspaceState as never,
    );
  });

  describe('resolveSecretsInText', () => {
    it('resolves a single secret', async () => {
      await service.setSecret('API_KEY', 'abc123');
      const result = await service.resolveSecretsInText('Bearer ${secret:API_KEY}');
      expect(result).toBe('Bearer abc123');
    });

    it('resolves multiple different secrets', async () => {
      await service.setSecret('USER', 'alice');
      await service.setSecret('PASS', 's3cret');
      const result = await service.resolveSecretsInText('${secret:USER}:${secret:PASS}');
      expect(result).toBe('alice:s3cret');
    });

    it('resolves the same secret appearing twice', async () => {
      await service.setSecret('TOKEN', 'xyz');
      const result = await service.resolveSecretsInText('${secret:TOKEN} and ${secret:TOKEN}');
      expect(result).toBe('xyz and xyz');
    });

    it('replaces missing secrets with empty string', async () => {
      const result = await service.resolveSecretsInText('key=${secret:MISSING}');
      expect(result).toBe('key=');
    });
  });

  describe('saveHistory', () => {
    it('caps history at 50 entries', () => {
      const entries = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        requestId: `req-${i}`,
        requestName: `Request ${i}`,
        query: '{ hello }',
        variables: {},
        response: null,
        responseTime: 100,
        timestamp: new Date().toISOString(),
        environment: 'local',
        success: true,
      }));

      service.saveHistory(entries);
      const loaded = service.loadHistory();
      expect(loaded).toHaveLength(50);
      // First 50 entries are kept (slice(0, 50))
      expect(loaded[0].id).toBe(0);
      expect(loaded[49].id).toBe(49);
    });
  });

  describe('migrateToWorkspace', () => {
    it('copies data from globalState to workspaceState once', () => {
      const collections = [{ id: 'c1', name: 'Col1', folders: [] }];
      globalState.update('graphqlClient.collections', collections);

      service.migrateToWorkspace();

      const loaded = service.loadCollections();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe('Col1');
    });

    it('skips migration on second call', () => {
      const collections = [{ id: 'c1', name: 'Col1', folders: [] }];
      globalState.update('graphqlClient.collections', collections);

      service.migrateToWorkspace();

      // Now update globalState with different data
      globalState.update('graphqlClient.collections', [{ id: 'c2', name: 'Col2', folders: [] }]);

      // Second migration should be a no-op because the migrated flag is set
      service.migrateToWorkspace();

      const loaded = service.loadCollections();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe('Col1');
    });
  });

  describe('loadCollections', () => {
    it('returns empty array when none saved', () => {
      const collections = service.loadCollections();
      expect(collections).toEqual([]);
    });
  });

  describe('loadEnvironments', () => {
    it('returns default environment when none saved', () => {
      const env = service.loadEnvironments();
      expect(env.active).toBe('local');
      expect(env.envs.local).toBeDefined();
      expect(env.envs.local.name).toBe('Local');
      expect(env.envs.local.headers['Content-Type']).toBe('application/json');
    });
  });
});
