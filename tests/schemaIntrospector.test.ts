import { describe, it, expect } from 'vitest';
import { generateOperationString } from '../src/schemaIntrospector';
import type { IntrospectedSchema, SchemaTypeRef } from '../src/types';

/** Helper: build a scalar type ref */
function scalar(name: string): SchemaTypeRef {
  return { kind: 'SCALAR', name, ofType: null };
}

/** Helper: wrap a type ref in NON_NULL */
function nonNull(inner: SchemaTypeRef): SchemaTypeRef {
  return { kind: 'NON_NULL', name: null, ofType: inner };
}

/** Helper: wrap a type ref in LIST */
function list(inner: SchemaTypeRef): SchemaTypeRef {
  return { kind: 'LIST', name: null, ofType: inner };
}

/** Helper: build an object type ref */
function objectRef(name: string): SchemaTypeRef {
  return { kind: 'OBJECT', name, ofType: null };
}

/** Helper: build an input object type ref */
function inputObjectRef(name: string): SchemaTypeRef {
  return { kind: 'INPUT_OBJECT', name, ofType: null };
}

/** Build a minimal schema with a query type containing the given fields */
function buildSchema(opts: {
  queryFields?: IntrospectedSchema['queryType'];
  mutationFields?: IntrospectedSchema['mutationType'];
  types?: IntrospectedSchema['types'];
  inputTypes?: IntrospectedSchema['inputTypes'];
}): IntrospectedSchema {
  return {
    queryType: opts.queryFields ?? null,
    mutationType: opts.mutationFields ?? null,
    types: opts.types ?? {},
    inputTypes: opts.inputTypes ?? {},
    fetchedAt: new Date().toISOString(),
    endpoint: 'http://localhost:4000/graphql',
  };
}

describe('generateOperationString', () => {
  it('generates a query with no args', () => {
    const schema = buildSchema({
      queryFields: {
        name: 'Query',
        fields: [
          {
            name: 'hello',
            description: null,
            args: [],
            type: scalar('String'),
          },
        ],
      },
    });

    const result = generateOperationString(schema, 'query', 'hello');

    expect(result.name).toBe('Hello');
    expect(result.type).toBe('query');
    expect(result.query).toContain('query Hello');
    expect(result.query).toContain('hello');
    // No variable declarations
    expect(result.query).not.toContain('$');
  });

  it('generates a query with args (includes variable declarations)', () => {
    const schema = buildSchema({
      queryFields: {
        name: 'Query',
        fields: [
          {
            name: 'user',
            description: null,
            args: [
              { name: 'id', type: nonNull(scalar('ID')), defaultValue: null },
              { name: 'includeEmail', type: scalar('Boolean'), defaultValue: null },
            ],
            type: objectRef('User'),
          },
        ],
      },
      types: {
        User: {
          name: 'User',
          fields: [
            { name: 'id', description: null, args: [], type: nonNull(scalar('ID')) },
            { name: 'name', description: null, args: [], type: scalar('String') },
          ],
        },
      },
    });

    const result = generateOperationString(schema, 'query', 'user');

    expect(result.query).toContain('$id: ID!');
    expect(result.query).toContain('$includeEmail: Boolean');
    expect(result.query).toContain('id: $id');
    expect(result.query).toContain('includeEmail: $includeEmail');
  });

  it('generates a mutation', () => {
    const schema = buildSchema({
      mutationFields: {
        name: 'Mutation',
        fields: [
          {
            name: 'createUser',
            description: null,
            args: [
              { name: 'name', type: nonNull(scalar('String')), defaultValue: null },
            ],
            type: objectRef('User'),
          },
        ],
      },
      types: {
        User: {
          name: 'User',
          fields: [
            { name: 'id', description: null, args: [], type: nonNull(scalar('ID')) },
          ],
        },
      },
    });

    const result = generateOperationString(schema, 'mutation', 'createUser');

    expect(result.type).toBe('mutation');
    expect(result.name).toBe('CreateUser');
    expect(result.query).toContain('mutation CreateUser');
    expect(result.query).toContain('$name: String!');
    expect(result.query).toContain('name: $name');
  });

  it('handles nested object return types (includes __typename)', () => {
    const schema = buildSchema({
      queryFields: {
        name: 'Query',
        fields: [
          {
            name: 'user',
            description: null,
            args: [],
            type: objectRef('User'),
          },
        ],
      },
      types: {
        User: {
          name: 'User',
          fields: [
            { name: 'id', description: null, args: [], type: nonNull(scalar('ID')) },
            { name: 'profile', description: null, args: [], type: objectRef('Profile') },
          ],
        },
        Profile: {
          name: 'Profile',
          fields: [
            { name: 'bio', description: null, args: [], type: scalar('String') },
          ],
        },
      },
    });

    const result = generateOperationString(schema, 'query', 'user');

    // Return type is OBJECT, so the query includes __typename
    expect(result.query).toContain('__typename');
    expect(result.returnTypeName).toBe('User');
  });

  it('handles scalar return types (no selection set)', () => {
    const schema = buildSchema({
      queryFields: {
        name: 'Query',
        fields: [
          {
            name: 'serverTime',
            description: null,
            args: [],
            type: scalar('String'),
          },
        ],
      },
    });

    const result = generateOperationString(schema, 'query', 'serverTime');

    // Scalar return means no nested selection set on the field itself
    expect(result.query).not.toContain('__typename');
    // The query wraps with operation braces, but serverTime has no sub-selection
    expect(result.query).toBe('query ServerTime {\n  serverTime\n}');
    expect(result.returnTypeName).toBeNull();
    expect(result.availableFields).toHaveLength(0);
  });

  it('throws for missing field', () => {
    const schema = buildSchema({
      queryFields: {
        name: 'Query',
        fields: [
          {
            name: 'hello',
            description: null,
            args: [],
            type: scalar('String'),
          },
        ],
      },
    });

    expect(() => generateOperationString(schema, 'query', 'nonExistent'))
      .toThrow('Field "nonExistent" not found on query type');
  });

  it('throws for missing query type', () => {
    const schema = buildSchema({});

    expect(() => generateOperationString(schema, 'query', 'anything'))
      .toThrow('No query type in schema');
  });

  it('throws for missing mutation type', () => {
    const schema = buildSchema({});

    expect(() => generateOperationString(schema, 'mutation', 'anything'))
      .toThrow('No mutation type in schema');
  });

  it('returns availableFields and operationArgs', () => {
    const schema = buildSchema({
      queryFields: {
        name: 'Query',
        fields: [
          {
            name: 'users',
            description: null,
            args: [
              { name: 'limit', type: scalar('Int'), defaultValue: '10' },
            ],
            type: list(objectRef('User')),
          },
        ],
      },
      types: {
        User: {
          name: 'User',
          fields: [
            { name: 'id', description: null, args: [], type: nonNull(scalar('ID')) },
            { name: 'name', description: null, args: [], type: scalar('String') },
          ],
        },
      },
    });

    const result = generateOperationString(schema, 'query', 'users');

    // operationArgs
    expect(result.operationArgs).toHaveLength(1);
    expect(result.operationArgs[0].name).toBe('limit');
    expect(result.operationArgs[0].type).toBe('Int');
    expect(result.operationArgs[0].required).toBe(false);
    expect(result.operationArgs[0].defaultValue).toBe('10');

    // availableFields — User has id and name, but the return type unwraps from LIST
    // The LIST wrapping means unwrapType goes to OBJECT User
    // Since the return type after unwrapping is OBJECT, availableFields should be populated
    expect(result.availableFields.length).toBeGreaterThanOrEqual(2);
    expect(result.availableFields.map(f => f.name)).toContain('id');
    expect(result.availableFields.map(f => f.name)).toContain('name');
  });

  it('handles input object default values', () => {
    const schema = buildSchema({
      mutationFields: {
        name: 'Mutation',
        fields: [
          {
            name: 'createUser',
            description: null,
            args: [
              { name: 'input', type: nonNull(inputObjectRef('CreateUserInput')), defaultValue: null },
            ],
            type: objectRef('User'),
          },
        ],
      },
      types: {
        User: {
          name: 'User',
          fields: [
            { name: 'id', description: null, args: [], type: nonNull(scalar('ID')) },
          ],
        },
      },
      inputTypes: {
        CreateUserInput: {
          name: 'CreateUserInput',
          fields: [
            { name: 'name', description: null, args: [], type: nonNull(scalar('String')) },
            { name: 'age', description: null, args: [], type: scalar('Int') },
            { name: 'active', description: null, args: [], type: scalar('Boolean') },
          ],
        },
      },
    });

    const result = generateOperationString(schema, 'mutation', 'createUser');

    // The variables string should contain default values derived from the input type
    const vars = JSON.parse(result.variables);
    expect(vars.input).toBeDefined();
    expect(vars.input.name).toBe('');
    expect(vars.input.age).toBe(0);
    expect(vars.input.active).toBe(false);
  });
});
