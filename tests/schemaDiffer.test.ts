import { describe, it, expect } from 'vitest';
import { unwrapType, typeRefToString, levenshteinDistance, diffSchemas, extractFieldsFromQuery } from '../src/schemaDiffer';
import type { SchemaTypeRef, IntrospectedSchema } from '../src/types';

function scalar(name: string): SchemaTypeRef {
  return { kind: 'SCALAR', name, ofType: null };
}

function nonNull(inner: SchemaTypeRef): SchemaTypeRef {
  return { kind: 'NON_NULL', name: null, ofType: inner };
}

function list(inner: SchemaTypeRef): SchemaTypeRef {
  return { kind: 'LIST', name: null, ofType: inner };
}

function makeSchema(overrides: Partial<IntrospectedSchema> = {}): IntrospectedSchema {
  return {
    queryType: null,
    mutationType: null,
    types: {},
    inputTypes: {},
    fetchedAt: new Date().toISOString(),
    endpoint: 'test',
    ...overrides,
  };
}

// ── unwrapType ──

describe('unwrapType', () => {
  it('returns scalar as-is', () => {
    const ref = scalar('String');
    expect(unwrapType(ref)).toEqual(ref);
  });

  it('unwraps NON_NULL', () => {
    const inner = scalar('Int');
    expect(unwrapType(nonNull(inner))).toEqual(inner);
  });

  it('unwraps LIST > NON_NULL > SCALAR', () => {
    const s = scalar('String');
    expect(unwrapType(list(nonNull(s)))).toEqual(s);
  });
});

// ── typeRefToString ──

describe('typeRefToString', () => {
  it('formats a scalar', () => {
    expect(typeRefToString(scalar('String'))).toBe('String');
  });

  it('formats NonNull scalar', () => {
    expect(typeRefToString(nonNull(scalar('Int')))).toBe('Int!');
  });

  it('formats [String!]!', () => {
    expect(typeRefToString(nonNull(list(nonNull(scalar('String')))))).toBe('[String!]!');
  });

  it('returns Unknown for null name', () => {
    expect(typeRefToString({ kind: 'SCALAR', name: null, ofType: null })).toBe('Unknown');
  });
});

// ── levenshteinDistance ──

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for known pair', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('single char difference', () => {
    expect(levenshteinDistance('cat', 'car')).toBe(1);
  });
});

// ── diffSchemas ──

describe('diffSchemas', () => {
  it('detects added types', () => {
    const oldS = makeSchema({ types: { User: { name: 'User', fields: [] } } });
    const newS = makeSchema({
      types: {
        User: { name: 'User', fields: [] },
        Post: { name: 'Post', fields: [] },
      },
    });
    const diff = diffSchemas(oldS, newS);
    expect(diff.addedTypes).toContain('Post');
    expect(diff.removedTypes).toHaveLength(0);
  });

  it('detects removed types as breaking', () => {
    const oldS = makeSchema({
      types: {
        User: { name: 'User', fields: [] },
        Post: { name: 'Post', fields: [] },
      },
    });
    const newS = makeSchema({ types: { User: { name: 'User', fields: [] } } });
    const diff = diffSchemas(oldS, newS);
    expect(diff.removedTypes).toContain('Post');
    expect(diff.hasBreakingChanges).toBe(true);
  });

  it('detects removed fields', () => {
    const oldS = makeSchema({
      types: {
        User: {
          name: 'User',
          fields: [
            { name: 'id', description: null, args: [], type: scalar('ID') },
            { name: 'name', description: null, args: [], type: scalar('String') },
          ],
        },
      },
    });
    const newS = makeSchema({
      types: {
        User: {
          name: 'User',
          fields: [{ name: 'id', description: null, args: [], type: scalar('ID') }],
        },
      },
    });
    const diff = diffSchemas(oldS, newS);
    expect(diff.fieldChanges).toHaveLength(1);
    expect(diff.fieldChanges[0].changeType).toBe('removed');
    expect(diff.fieldChanges[0].fieldName).toBe('name');
  });

  it('detects type changes on fields', () => {
    const oldS = makeSchema({
      types: {
        User: {
          name: 'User',
          fields: [{ name: 'age', description: null, args: [], type: scalar('Int') }],
        },
      },
    });
    const newS = makeSchema({
      types: {
        User: {
          name: 'User',
          fields: [{ name: 'age', description: null, args: [], type: scalar('String') }],
        },
      },
    });
    const diff = diffSchemas(oldS, newS);
    expect(diff.fieldChanges[0].changeType).toBe('type_changed');
  });

  it('detects field renames with similar names and same type', () => {
    const oldS = makeSchema({
      types: {
        User: {
          name: 'User',
          fields: [{ name: 'userName', description: null, args: [], type: scalar('String') }],
        },
      },
    });
    const newS = makeSchema({
      types: {
        User: {
          name: 'User',
          fields: [{ name: 'username', description: null, args: [], type: scalar('String') }],
        },
      },
    });
    const diff = diffSchemas(oldS, newS);
    expect(diff.fieldChanges[0].changeType).toBe('renamed');
    expect(diff.fieldChanges[0].suggestedReplacement).toBe('username');
  });

  it('reports no changes for identical schemas', () => {
    const s = makeSchema({
      types: {
        User: {
          name: 'User',
          fields: [{ name: 'id', description: null, args: [], type: scalar('ID') }],
        },
      },
    });
    const diff = diffSchemas(s, s);
    expect(diff.summary).toBe('No changes detected');
    expect(diff.hasBreakingChanges).toBe(false);
  });

  it('detects args changes', () => {
    const oldS = makeSchema({
      types: {
        Query: {
          name: 'Query',
          fields: [{
            name: 'user',
            description: null,
            args: [{ name: 'id', type: scalar('ID'), defaultValue: null }],
            type: scalar('String'),
          }],
        },
      },
    });
    const newS = makeSchema({
      types: {
        Query: {
          name: 'Query',
          fields: [{
            name: 'user',
            description: null,
            args: [{ name: 'userId', type: scalar('ID'), defaultValue: null }],
            type: scalar('String'),
          }],
        },
      },
    });
    const diff = diffSchemas(oldS, newS);
    const argsChange = diff.fieldChanges.find(c => c.changeType === 'args_changed');
    expect(argsChange).toBeDefined();
  });
});

// ── extractFieldsFromQuery ──

describe('extractFieldsFromQuery', () => {
  it('extracts fields from a simple query', () => {
    const query = `query { user { id name } }`;
    const analysis = extractFieldsFromQuery(query);
    expect(analysis.operationType).toBe('query');
    const names = analysis.extractedFields.map(f => f.fieldName);
    expect(names).toContain('user');
    expect(names).toContain('id');
    expect(names).toContain('name');
  });

  it('detects mutation operation type', () => {
    const query = `mutation CreateUser { createUser { id } }`;
    const analysis = extractFieldsFromQuery(query);
    expect(analysis.operationType).toBe('mutation');
  });

  it('tracks max depth', () => {
    const query = `
      query {
        a {
          b {
            c {
              d
            }
          }
        }
      }
    `;
    const analysis = extractFieldsFromQuery(query);
    expect(analysis.maxDepth).toBeGreaterThanOrEqual(4);
  });

  it('extracts variable definitions', () => {
    const query = `query GetUser($id: ID!, $flag: Boolean) { user { name } }`;
    const analysis = extractFieldsFromQuery(query);
    expect(analysis.variableDefinitions).toHaveLength(2);
    expect(analysis.variableDefinitions[0].name).toBe('id');
    expect(analysis.variableDefinitions[1].name).toBe('flag');
  });

  it('detects aliases', () => {
    const query = `query { first: user { id } second: user { id } }`;
    const analysis = extractFieldsFromQuery(query);
    const aliased = analysis.extractedFields.filter(f => f.aliasOf);
    expect(aliased.length).toBeGreaterThanOrEqual(2);
  });

  it('skips comments', () => {
    const query = `query {\n  # comment\n  user { id }\n}`;
    const analysis = extractFieldsFromQuery(query);
    const names = analysis.extractedFields.map(f => f.fieldName);
    expect(names).not.toContain('comment');
  });
});
