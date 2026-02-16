import { describe, it, expect } from 'vitest';
import { diffResponses, computeAllPairDiffs } from '../src/responseDiffer';

describe('diffResponses', () => {
  it('returns same for identical values', () => {
    const nodes = diffResponses({ a: 1 }, { a: 1 });
    expect(nodes.every(n => n.type === 'same')).toBe(true);
  });

  it('detects added keys', () => {
    const nodes = diffResponses({ a: 1 }, { a: 1, b: 2 });
    const added = nodes.find(n => n.type === 'added');
    expect(added).toBeDefined();
    expect(added!.path).toBe('$.b');
  });

  it('detects removed keys', () => {
    const nodes = diffResponses({ a: 1, b: 2 }, { a: 1 });
    const removed = nodes.find(n => n.type === 'removed');
    expect(removed).toBeDefined();
    expect(removed!.path).toBe('$.b');
  });

  it('detects changed scalar values', () => {
    const nodes = diffResponses({ a: 1 }, { a: 2 });
    const changed = nodes.find(n => n.type === 'changed');
    expect(changed).toBeDefined();
    expect(changed!.leftValue).toBe(1);
    expect(changed!.rightValue).toBe(2);
  });

  it('diffs arrays by index', () => {
    const nodes = diffResponses([1, 2, 3], [1, 2, 4]);
    const changed = nodes.find(n => n.type === 'changed');
    expect(changed).toBeDefined();
  });

  it('detects array additions', () => {
    const nodes = diffResponses([1], [1, 2]);
    const added = nodes.find(n => n.type === 'added');
    expect(added).toBeDefined();
  });

  it('detects array removals', () => {
    const nodes = diffResponses([1, 2], [1]);
    const removed = nodes.find(n => n.type === 'removed');
    expect(removed).toBeDefined();
  });

  it('handles null on one side', () => {
    const nodes = diffResponses(null, { a: 1 });
    expect(nodes[0].type).toBe('added');
  });

  it('handles different types', () => {
    const nodes = diffResponses('hello', 42);
    expect(nodes[0].type).toBe('changed');
  });

  it('aligns arrays by id when available', () => {
    const left = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];
    const right = [{ id: '2', name: 'Bobby' }, { id: '1', name: 'Alice' }];
    const nodes = diffResponses(left, right);
    // id:1 should be same, id:2 should show changed
    const sameNode = nodes.find(n => n.type === 'same');
    expect(sameNode).toBeDefined();
  });

  it('handles deeply nested objects', () => {
    const left = { a: { b: { c: 1 } } };
    const right = { a: { b: { c: 2 } } };
    const nodes = diffResponses(left, right);
    const changed = nodes.find(n => n.type === 'changed');
    expect(changed).toBeDefined();
  });
});

describe('computeAllPairDiffs', () => {
  it('returns empty for fewer than 2 successful results', () => {
    const diffs = computeAllPairDiffs([
      { envKey: 'dev', envName: 'Dev', endpoint: 'http://dev', data: {}, responseTime: 100, success: true },
    ]);
    expect(diffs).toHaveLength(0);
  });

  it('returns one diff pair for 2 successful results', () => {
    const diffs = computeAllPairDiffs([
      { envKey: 'dev', envName: 'Dev', endpoint: 'http://dev', data: { a: 1 }, responseTime: 100, success: true },
      { envKey: 'prod', envName: 'Prod', endpoint: 'http://prod', data: { a: 2 }, responseTime: 200, success: true },
    ]);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].leftEnv).toBe('dev');
    expect(diffs[0].rightEnv).toBe('prod');
  });

  it('filters out failed results', () => {
    const diffs = computeAllPairDiffs([
      { envKey: 'dev', envName: 'Dev', endpoint: 'http://dev', data: { a: 1 }, responseTime: 100, success: true },
      { envKey: 'staging', envName: 'Staging', endpoint: 'http://staging', data: null, responseTime: 0, success: false },
      { envKey: 'prod', envName: 'Prod', endpoint: 'http://prod', data: { a: 1 }, responseTime: 200, success: true },
    ]);
    expect(diffs).toHaveLength(1);
  });

  it('returns 3 pairs for 3 successful results', () => {
    const diffs = computeAllPairDiffs([
      { envKey: 'a', envName: 'A', endpoint: '', data: {}, responseTime: 1, success: true },
      { envKey: 'b', envName: 'B', endpoint: '', data: {}, responseTime: 1, success: true },
      { envKey: 'c', envName: 'C', endpoint: '', data: {}, responseTime: 1, success: true },
    ]);
    expect(diffs).toHaveLength(3);
  });
});
