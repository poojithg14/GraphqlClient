import { describe, it, expect } from 'vitest';
import { parseSchemaInput } from '../src/sdlParser';

describe('parseSchemaInput', () => {
  describe('SDL parsing', () => {
    it('parses a simple type with scalar fields', () => {
      const sdl = `
        type Query {
          user(id: ID!): User
        }
        type User {
          id: ID!
          name: String
          age: Int
        }
      `;
      const schema = parseSchemaInput(sdl);
      expect(schema.queryType).not.toBeNull();
      expect(schema.queryType!.name).toBe('Query');
      expect(schema.queryType!.fields).toHaveLength(1);
      expect(schema.queryType!.fields[0].name).toBe('user');
      expect(schema.types['User']).toBeDefined();
      expect(schema.types['User'].fields).toHaveLength(3);
    });

    it('parses input types separately', () => {
      const sdl = `
        type Mutation {
          createUser(input: CreateUserInput!): User
        }
        type User {
          id: ID!
        }
        input CreateUserInput {
          name: String!
          email: String!
        }
      `;
      const schema = parseSchemaInput(sdl);
      expect(schema.mutationType).not.toBeNull();
      expect(schema.inputTypes['CreateUserInput']).toBeDefined();
      expect(schema.inputTypes['CreateUserInput'].fields).toHaveLength(2);
    });

    it('parses enum types as types with no fields', () => {
      const sdl = `
        type Query {
          status: Status
        }
        enum Status {
          ACTIVE
          INACTIVE
        }
      `;
      const schema = parseSchemaInput(sdl);
      expect(schema.types['Status']).toBeDefined();
      expect(schema.types['Status'].fields).toHaveLength(0);
    });

    it('throws on empty/invalid SDL', () => {
      expect(() => parseSchemaInput('not a schema')).toThrow('Could not parse SDL');
    });

    it('handles list and non-null types', () => {
      const sdl = `
        type Query {
          users: [User!]!
        }
        type User {
          id: ID!
        }
      `;
      const schema = parseSchemaInput(sdl);
      const field = schema.queryType!.fields[0];
      expect(field.type.kind).toBe('NON_NULL');
      expect(field.type.ofType!.kind).toBe('LIST');
      expect(field.type.ofType!.ofType!.kind).toBe('NON_NULL');
    });

    it('parses field arguments', () => {
      const sdl = `
        type Query {
          user(id: ID!, name: String): User
        }
        type User {
          id: ID!
        }
      `;
      const schema = parseSchemaInput(sdl);
      const args = schema.queryType!.fields[0].args;
      expect(args).toHaveLength(2);
      expect(args[0].name).toBe('id');
      expect(args[1].name).toBe('name');
    });
  });

  describe('JSON introspection parsing', () => {
    it('parses { data: { __schema: ... } } format', () => {
      const json = JSON.stringify({
        data: {
          __schema: {
            queryType: { name: 'Query' },
            mutationType: null,
            types: [
              {
                name: 'Query',
                kind: 'OBJECT',
                fields: [
                  {
                    name: 'hello',
                    description: 'A greeting',
                    args: [],
                    type: { kind: 'SCALAR', name: 'String', ofType: null },
                  },
                ],
              },
            ],
          },
        },
      });
      const schema = parseSchemaInput(json);
      expect(schema.queryType).not.toBeNull();
      expect(schema.queryType!.fields[0].name).toBe('hello');
    });

    it('parses { __schema: ... } format', () => {
      const json = JSON.stringify({
        __schema: {
          queryType: { name: 'Query' },
          mutationType: null,
          types: [
            {
              name: 'Query',
              kind: 'OBJECT',
              fields: [
                {
                  name: 'hello',
                  description: null,
                  args: [],
                  type: { kind: 'SCALAR', name: 'String', ofType: null },
                },
              ],
            },
          ],
        },
      });
      const schema = parseSchemaInput(json);
      expect(schema.queryType).not.toBeNull();
    });

    it('skips __-prefixed types', () => {
      const json = JSON.stringify({
        __schema: {
          queryType: { name: 'Query' },
          mutationType: null,
          types: [
            { name: '__Schema', kind: 'OBJECT', fields: [] },
            { name: 'Query', kind: 'OBJECT', fields: [] },
          ],
        },
      });
      const schema = parseSchemaInput(json);
      expect(schema.types['__Schema']).toBeUndefined();
      expect(schema.types['Query']).toBeDefined();
    });

    it('throws on invalid JSON', () => {
      expect(() => parseSchemaInput('{ broken')).toThrow('Invalid JSON');
    });

    it('throws if __schema is missing', () => {
      expect(() => parseSchemaInput('{"foo": 1}')).toThrow('__schema');
    });

    it('parses INPUT_OBJECT types into inputTypes', () => {
      const json = JSON.stringify({
        __schema: {
          queryType: { name: 'Query' },
          mutationType: null,
          types: [
            { name: 'Query', kind: 'OBJECT', fields: [] },
            {
              name: 'UserInput',
              kind: 'INPUT_OBJECT',
              inputFields: [
                { name: 'name', type: { kind: 'SCALAR', name: 'String', ofType: null } },
              ],
            },
          ],
        },
      });
      const schema = parseSchemaInput(json);
      expect(schema.inputTypes['UserInput']).toBeDefined();
      expect(schema.inputTypes['UserInput'].fields[0].name).toBe('name');
    });
  });
});
