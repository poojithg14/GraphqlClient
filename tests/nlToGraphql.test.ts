import { describe, it, expect } from 'vitest';
import { parseNaturalLanguage, generateFromNL, generateResolverStub } from '../src/nlToGraphql';
import type { IntrospectedSchema, SchemaTypeRef } from '../src/types';

function scalar(name: string): SchemaTypeRef {
  return { kind: 'SCALAR', name, ofType: null };
}

function objectRef(name: string): SchemaTypeRef {
  return { kind: 'OBJECT', name, ofType: null };
}

function nonNull(inner: SchemaTypeRef): SchemaTypeRef {
  return { kind: 'NON_NULL', name: null, ofType: inner };
}

function listOf(inner: SchemaTypeRef): SchemaTypeRef {
  return { kind: 'LIST', name: null, ofType: inner };
}

function makeTestSchema(): IntrospectedSchema {
  const queryType = {
    name: 'Query',
    fields: [
      {
        name: 'user',
        description: null,
        args: [{ name: 'id', type: nonNull(scalar('ID')), defaultValue: null }],
        type: objectRef('User'),
      },
      {
        name: 'users',
        description: null,
        args: [{ name: 'first', type: scalar('Int'), defaultValue: null }],
        type: listOf(objectRef('User')),
      },
      {
        name: 'posts',
        description: null,
        args: [],
        type: listOf(objectRef('Post')),
      },
    ],
  };
  const mutationType = {
    name: 'Mutation',
    fields: [
      {
        name: 'createUser',
        description: null,
        args: [{ name: 'input', type: nonNull(objectRef('CreateUserInput')), defaultValue: null }],
        type: objectRef('User'),
      },
      {
        name: 'deleteUser',
        description: null,
        args: [{ name: 'id', type: nonNull(scalar('ID')), defaultValue: null }],
        type: objectRef('User'),
      },
    ],
  };
  return {
    queryType,
    mutationType,
    types: {
      Query: queryType,
      Mutation: mutationType,
      User: {
        name: 'User',
        fields: [
          { name: 'id', description: null, args: [], type: nonNull(scalar('ID')) },
          { name: 'name', description: null, args: [], type: scalar('String') },
          { name: 'email', description: null, args: [], type: scalar('String') },
          { name: 'age', description: null, args: [], type: scalar('Int') },
        ],
      },
      Post: {
        name: 'Post',
        fields: [
          { name: 'id', description: null, args: [], type: nonNull(scalar('ID')) },
          { name: 'title', description: null, args: [], type: scalar('String') },
          { name: 'body', description: null, args: [], type: scalar('String') },
        ],
      },
    },
    inputTypes: {
      CreateUserInput: {
        name: 'CreateUserInput',
        fields: [
          { name: 'name', description: null, args: [], type: nonNull(scalar('String')) },
          { name: 'email', description: null, args: [], type: nonNull(scalar('String')) },
        ],
      },
    },
    fetchedAt: new Date().toISOString(),
    endpoint: 'test',
  };
}

// ── parseNaturalLanguage ──

describe('parseNaturalLanguage', () => {
  const schema = makeTestSchema();

  it('detects "get" intent', () => {
    const result = parseNaturalLanguage('get user by id', schema);
    expect(result.intent).toBe('get');
  });

  it('detects "list" intent', () => {
    const result = parseNaturalLanguage('list all users', schema);
    expect(result.intent).toBe('list');
  });

  it('detects "create" intent', () => {
    const result = parseNaturalLanguage('create a new user', schema);
    expect(result.intent).toBe('create');
  });

  it('detects "update" intent', () => {
    const result = parseNaturalLanguage('update user email', schema);
    expect(result.intent).toBe('update');
  });

  it('detects "delete" intent', () => {
    const result = parseNaturalLanguage('delete user', schema);
    expect(result.intent).toBe('delete');
  });

  it('matches entity to schema root field', () => {
    const result = parseNaturalLanguage('get user', schema);
    expect(result.entityName).toBe('user');
  });

  it('matches entity to type name as fallback', () => {
    const result = parseNaturalLanguage('fetch Post', schema);
    expect(result.entityName.toLowerCase()).toContain('post');
  });

  it('field hints are empty when entity matches root field (case mismatch with type)', () => {
    // entityName = 'user' (lowercase root field), but schema.types key is 'User'
    const result = parseNaturalLanguage('get user name email', schema);
    expect(result.entityName).toBe('user');
    expect(result.fieldHints).toHaveLength(0);
  });

  it('extracts filters from "where X is Y"', () => {
    const result = parseNaturalLanguage('get user where name is "Alice"', schema);
    expect(result.filters.length).toBeGreaterThanOrEqual(1);
    expect(result.filters[0].field).toBe('name');
    expect(result.filters[0].value).toBe('Alice');
  });

  it('returns unknown intent for gibberish', () => {
    const result = parseNaturalLanguage('xyzzy');
    expect(result.intent).toBe('unknown');
  });

  it('"all" modifier upgrades get to list', () => {
    const result = parseNaturalLanguage('get all users', schema);
    expect(result.intent).toBe('list');
  });
});

// ── generateFromNL ──

describe('generateFromNL', () => {
  const schema = makeTestSchema();

  it('generates a query for "get" intent', () => {
    const parsed = parseNaturalLanguage('get user', schema);
    const result = generateFromNL(parsed, schema);
    expect(result.query).toContain('query');
    expect(result.query).toContain('user');
  });

  it('generates a mutation for "create" intent', () => {
    const parsed = parseNaturalLanguage('create user', schema);
    const result = generateFromNL(parsed, schema);
    expect(result.query).toContain('mutation');
    expect(result.query).toContain('createUser');
  });

  it('generates a mutation for "delete" intent', () => {
    const parsed = parseNaturalLanguage('delete user', schema);
    const result = generateFromNL(parsed, schema);
    expect(result.query).toContain('mutation');
    expect(result.query).toContain('deleteUser');
  });

  it('includes variable declarations for args', () => {
    const parsed = parseNaturalLanguage('get user', schema);
    const result = generateFromNL(parsed, schema);
    expect(result.query).toContain('$id');
    expect(result.query).toContain('ID!');
  });

  it('includes scalar fields in selection set', () => {
    const parsed = parseNaturalLanguage('get user', schema);
    const result = generateFromNL(parsed, schema);
    expect(result.query).toContain('id');
    expect(result.query).toContain('name');
  });

  it('returns valid JSON variables', () => {
    const parsed = parseNaturalLanguage('get user', schema);
    const result = generateFromNL(parsed, schema);
    expect(() => JSON.parse(result.variables)).not.toThrow();
  });

  it('parses filter from NL input', () => {
    const parsed = parseNaturalLanguage('list users where first is 5', schema);
    expect(parsed.filters.length).toBeGreaterThanOrEqual(1);
    expect(parsed.filters[0].field).toBe('first');
    expect(parsed.filters[0].value).toBe('5');
  });

  it('returns available fields metadata', () => {
    const parsed = parseNaturalLanguage('get user', schema);
    const result = generateFromNL(parsed, schema);
    expect(result.returnTypeName).toBe('User');
    expect(result.availableFields.length).toBeGreaterThan(0);
  });
});

// ── generateResolverStub ──

describe('generateResolverStub', () => {
  const schema = makeTestSchema();

  it('generates query resolver with findUnique for id arg', () => {
    const result = generateResolverStub(schema, 'query', 'user');
    expect(result.code).toContain('findUnique');
    expect(result.code).toContain('args.id');
    expect(result.language).toBe('typescript');
  });

  it('generates query resolver with findMany for list fields', () => {
    const result = generateResolverStub(schema, 'query', 'users');
    expect(result.code).toContain('findMany');
  });

  it('generates mutation resolver with create', () => {
    const result = generateResolverStub(schema, 'mutation', 'createUser');
    expect(result.code).toContain('create');
  });

  it('generates mutation resolver with delete', () => {
    const result = generateResolverStub(schema, 'mutation', 'deleteUser');
    expect(result.code).toContain('delete');
  });

  it('returns comment when field not found', () => {
    const result = generateResolverStub(schema, 'query', 'nonexistent');
    expect(result.code).toContain('not found');
  });

  it('returns comment when root type is missing', () => {
    const noMutation: IntrospectedSchema = { ...schema, mutationType: null };
    const result = generateResolverStub(noMutation, 'mutation', 'createUser');
    expect(result.code).toContain('No mutation type');
  });

  it('generates args interface for fields with arguments', () => {
    const result = generateResolverStub(schema, 'query', 'user');
    expect(result.code).toContain('interface UserArgs');
    expect(result.code).toContain('id: string');
  });
});
