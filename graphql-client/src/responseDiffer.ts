import type { DiffNode, EnvExecutionResult } from './types';

const MAX_DEPTH = 10;
const MAX_NODES = 5000;

let nodeCount = 0;

/** Recursively diff two JSON values */
export function diffResponses(left: unknown, right: unknown, path: string = '$'): DiffNode[] {
  nodeCount = 0;
  return diffRecursive(left, right, path, 0);
}

function diffRecursive(left: unknown, right: unknown, path: string, depth: number): DiffNode[] {
  if (depth > MAX_DEPTH || nodeCount > MAX_NODES) return [];

  // Both null/undefined
  if (left === right) {
    nodeCount++;
    return [{ path, type: 'same', leftValue: left, rightValue: right }];
  }

  // One side missing
  if (left === undefined || left === null) {
    nodeCount++;
    return [{ path, type: 'added', rightValue: right }];
  }
  if (right === undefined || right === null) {
    nodeCount++;
    return [{ path, type: 'removed', leftValue: left }];
  }

  // Different types
  if (typeof left !== typeof right) {
    nodeCount++;
    return [{ path, type: 'changed', leftValue: left, rightValue: right }];
  }

  // Arrays
  if (Array.isArray(left) && Array.isArray(right)) {
    return diffArrays(left, right, path, depth);
  }

  // Objects
  if (typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    return diffObjects(left as Record<string, unknown>, right as Record<string, unknown>, path, depth);
  }

  // Scalars
  nodeCount++;
  if (left === right) {
    return [{ path, type: 'same', leftValue: left, rightValue: right }];
  }
  return [{ path, type: 'changed', leftValue: left, rightValue: right }];
}

function diffArrays(left: unknown[], right: unknown[], path: string, depth: number): DiffNode[] {
  const nodes: DiffNode[] = [];
  const maxLen = Math.max(left.length, right.length);

  // Try to align by `id` or `__typename` if present
  const leftIds = left.map(item => getIdentifier(item));
  const rightIds = right.map(item => getIdentifier(item));
  const useIdAlign = leftIds.some(id => id !== null) && rightIds.some(id => id !== null);

  if (useIdAlign) {
    const rightIdMap = new Map<string, { item: unknown; idx: number }>();
    for (let i = 0; i < right.length; i++) {
      const id = rightIds[i];
      if (id !== null) rightIdMap.set(id, { item: right[i], idx: i });
    }

    const matchedRight = new Set<number>();
    for (let i = 0; i < left.length; i++) {
      const id = leftIds[i];
      if (id !== null && rightIdMap.has(id)) {
        const match = rightIdMap.get(id)!;
        matchedRight.add(match.idx);
        const children = diffRecursive(left[i], match.item, `${path}[${i}]`, depth + 1);
        const allSame = children.every(c => c.type === 'same');
        nodeCount++;
        nodes.push({ path: `${path}[${i}]`, type: allSame ? 'same' : 'changed', leftValue: left[i], rightValue: match.item, children: allSame ? undefined : children });
      } else {
        nodeCount++;
        nodes.push({ path: `${path}[${i}]`, type: 'removed', leftValue: left[i] });
      }
      if (nodeCount > MAX_NODES) break;
    }

    for (let i = 0; i < right.length; i++) {
      if (!matchedRight.has(i)) {
        nodeCount++;
        nodes.push({ path: `${path}[${i}]`, type: 'added', rightValue: right[i] });
      }
      if (nodeCount > MAX_NODES) break;
    }
  } else {
    // Align by index
    for (let i = 0; i < maxLen; i++) {
      if (nodeCount > MAX_NODES) break;
      if (i >= left.length) {
        nodeCount++;
        nodes.push({ path: `${path}[${i}]`, type: 'added', rightValue: right[i] });
      } else if (i >= right.length) {
        nodeCount++;
        nodes.push({ path: `${path}[${i}]`, type: 'removed', leftValue: left[i] });
      } else {
        const children = diffRecursive(left[i], right[i], `${path}[${i}]`, depth + 1);
        const allSame = children.every(c => c.type === 'same');
        nodeCount++;
        nodes.push({ path: `${path}[${i}]`, type: allSame ? 'same' : 'changed', leftValue: left[i], rightValue: right[i], children: allSame ? undefined : children });
      }
    }
  }

  return nodes;
}

function diffObjects(left: Record<string, unknown>, right: Record<string, unknown>, path: string, depth: number): DiffNode[] {
  const nodes: DiffNode[] = [];
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of allKeys) {
    if (nodeCount > MAX_NODES) break;
    const keyPath = `${path}.${key}`;
    if (!(key in left)) {
      nodeCount++;
      nodes.push({ path: keyPath, type: 'added', rightValue: right[key] });
    } else if (!(key in right)) {
      nodeCount++;
      nodes.push({ path: keyPath, type: 'removed', leftValue: left[key] });
    } else {
      const children = diffRecursive(left[key], right[key], keyPath, depth + 1);
      const allSame = children.every(c => c.type === 'same');
      if (allSame) {
        nodeCount++;
        nodes.push({ path: keyPath, type: 'same', leftValue: left[key], rightValue: right[key] });
      } else {
        nodeCount++;
        nodes.push({ path: keyPath, type: 'changed', leftValue: left[key], rightValue: right[key], children });
      }
    }
  }

  return nodes;
}

function getIdentifier(item: unknown): string | null {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    if (typeof obj.id === 'string' || typeof obj.id === 'number') return String(obj.id);
    if (typeof obj.__typename === 'string') return obj.__typename;
  }
  return null;
}

/** Compute pairwise diffs for all successful environment results */
export function computeAllPairDiffs(
  results: EnvExecutionResult[],
): Array<{ leftEnv: string; rightEnv: string; nodes: DiffNode[] }> {
  const successful = results.filter(r => r.success);
  const diffs: Array<{ leftEnv: string; rightEnv: string; nodes: DiffNode[] }> = [];

  for (let i = 0; i < successful.length; i++) {
    for (let j = i + 1; j < successful.length; j++) {
      const nodes = diffResponses(successful[i].data, successful[j].data);
      diffs.push({
        leftEnv: successful[i].envKey,
        rightEnv: successful[j].envKey,
        nodes,
      });
    }
  }

  return diffs;
}
