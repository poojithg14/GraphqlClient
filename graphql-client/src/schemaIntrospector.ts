import type { IntrospectedSchema, SchemaObjectType, SchemaField, SchemaArgument, SchemaTypeRef } from './types';

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        kind
        name
        fields(includeDeprecated: false) {
          name
          description
          args {
            name
            type { ...TypeRef }
            defaultValue
          }
          type { ...TypeRef }
        }
      }
    }
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
`;

interface RawType {
  kind: string;
  name: string;
  fields: Array<{
    name: string;
    description: string | null;
    args: Array<{
      name: string;
      type: SchemaTypeRef;
      defaultValue: string | null;
    }>;
    type: SchemaTypeRef;
  }> | null;
}

function parseFields(rawFields: RawType['fields']): SchemaField[] {
  if (!rawFields) return [];
  return rawFields.map(f => ({
    name: f.name,
    description: f.description,
    args: f.args.map((a): SchemaArgument => ({
      name: a.name,
      type: a.type,
      defaultValue: a.defaultValue,
    })),
    type: f.type,
  }));
}

export async function introspectSchema(
  endpoint: string,
  headers: Record<string, string>,
): Promise<IntrospectedSchema> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });

  if (!res.ok) {
    throw new Error(`Introspection failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as { data?: { __schema: { queryType: { name: string } | null; mutationType: { name: string } | null; types: RawType[] } }; errors?: Array<{ message: string }> };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Introspection errors: ${json.errors.map(e => e.message).join(', ')}`);
  }

  if (!json.data?.__schema) {
    throw new Error('Invalid introspection response: missing __schema');
  }

  const schema = json.data.__schema;
  const queryTypeName = schema.queryType?.name ?? null;
  const mutationTypeName = schema.mutationType?.name ?? null;

  const types: Record<string, SchemaObjectType> = {};
  const inputTypes: Record<string, SchemaObjectType> = {};
  let queryType: SchemaObjectType | null = null;
  let mutationType: SchemaObjectType | null = null;

  for (const t of schema.types) {
    // Skip internal types
    if (t.name.startsWith('__')) continue;

    if (t.kind === 'OBJECT' && t.fields) {
      const parsed: SchemaObjectType = { name: t.name, fields: parseFields(t.fields) };
      types[t.name] = parsed;

      if (t.name === queryTypeName) queryType = parsed;
      if (t.name === mutationTypeName) mutationType = parsed;
    } else if (t.kind === 'INPUT_OBJECT' && t.fields) {
      inputTypes[t.name] = { name: t.name, fields: parseFields(t.fields) };
    }
  }

  return {
    queryType,
    mutationType,
    types,
    inputTypes,
    fetchedAt: new Date().toISOString(),
    endpoint,
  };
}

/** Unwrap NON_NULL / LIST wrappers to get the named type */
function unwrapType(ref: SchemaTypeRef): SchemaTypeRef {
  let current = ref;
  while (current.ofType && (current.kind === 'NON_NULL' || current.kind === 'LIST')) {
    current = current.ofType;
  }
  return current;
}

/** Get a display string for a type reference (e.g. "[User!]!") */
function typeRefToString(ref: SchemaTypeRef): string {
  if (ref.kind === 'NON_NULL') {
    return typeRefToString(ref.ofType!) + '!';
  }
  if (ref.kind === 'LIST') {
    return '[' + typeRefToString(ref.ofType!) + ']';
  }
  return ref.name ?? 'Unknown';
}

/** Build selection set for a return type, depth-limited and cycle-safe */
function buildSelectionSet(
  typeName: string,
  allTypes: Record<string, SchemaObjectType>,
  depth: number,
  visited: Set<string>,
): string[] {
  if (depth <= 0 || visited.has(typeName)) return [];

  const objectType = allTypes[typeName];
  if (!objectType) return [];

  visited.add(typeName);
  const lines: string[] = [];

  for (const field of objectType.fields) {
    const inner = unwrapType(field.type);

    if (inner.kind === 'SCALAR' || inner.kind === 'ENUM') {
      lines.push(field.name);
    } else if (inner.kind === 'OBJECT' && inner.name && depth > 1) {
      const nested = buildSelectionSet(inner.name, allTypes, depth - 1, new Set(visited));
      if (nested.length > 0) {
        lines.push(field.name + ' {');
        nested.forEach(l => lines.push('  ' + l));
        lines.push('}');
      }
    }
  }

  return lines;
}

/** Generate default variable value for a type */
function defaultValueForType(
  ref: SchemaTypeRef,
  inputTypes: Record<string, SchemaObjectType>,
  visited: Set<string>,
): unknown {
  const inner = unwrapType(ref);

  if (inner.kind === 'SCALAR') {
    switch (inner.name) {
      case 'String': case 'ID': return '';
      case 'Int': return 0;
      case 'Float': return 0.0;
      case 'Boolean': return false;
      default: return null;
    }
  }

  if (inner.kind === 'ENUM') return null;

  if (inner.kind === 'INPUT_OBJECT' && inner.name) {
    if (visited.has(inner.name)) return {};
    visited.add(inner.name);
    const inputType = inputTypes[inner.name];
    if (!inputType) return {};
    const obj: Record<string, unknown> = {};
    for (const field of inputType.fields) {
      obj[field.name] = defaultValueForType(field.type, inputTypes, new Set(visited));
    }
    return obj;
  }

  if (ref.kind === 'LIST') return [];

  return null;
}

export function generateOperationString(
  schema: IntrospectedSchema,
  operationType: 'query' | 'mutation',
  fieldName: string,
): { name: string; type: 'query' | 'mutation'; query: string; variables: string; returnTypeName: string | null; availableFields: Array<{ name: string; type: string; hasSubFields: boolean }>; operationArgs: Array<{ name: string; type: string; required: boolean; defaultValue: string | null }> } {
  const rootType = operationType === 'query' ? schema.queryType : schema.mutationType;
  if (!rootType) {
    throw new Error(`No ${operationType} type in schema`);
  }

  const field = rootType.fields.find(f => f.name === fieldName);
  if (!field) {
    throw new Error(`Field "${fieldName}" not found on ${operationType} type`);
  }

  const opName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

  // Build variable declarations and argument usage
  const varDecls: string[] = [];
  const argUsages: string[] = [];
  const defaultVars: Record<string, unknown> = {};

  for (const arg of field.args) {
    const typeStr = typeRefToString(arg.type);
    varDecls.push(`$${arg.name}: ${typeStr}`);
    argUsages.push(`${arg.name}: $${arg.name}`);
    defaultVars[arg.name] = defaultValueForType(arg.type, schema.inputTypes, new Set());
  }

  // Determine return type and available fields
  const returnType = unwrapType(field.type);
  let returnTypeName: string | null = null;
  const availableFields: Array<{ name: string; type: string; hasSubFields: boolean }> = [];

  if (returnType.kind === 'OBJECT' && returnType.name) {
    returnTypeName = returnType.name;
    const objectType = schema.types[returnType.name];
    if (objectType) {
      for (const f of objectType.fields) {
        const inner = unwrapType(f.type);
        availableFields.push({
          name: f.name,
          type: typeRefToString(f.type),
          hasSubFields: inner.kind === 'OBJECT',
        });
      }
    }
  }

  // Assemble skeleton query with __typename placeholder
  const varPart = varDecls.length > 0 ? `(${varDecls.join(', ')})` : '';
  const argPart = argUsages.length > 0 ? `(${argUsages.join(', ')})` : '';

  let query: string;
  if (returnTypeName) {
    query = `${operationType} ${opName}${varPart} {\n  ${fieldName}${argPart} {\n    __typename\n  }\n}`;
  } else {
    query = `${operationType} ${opName}${varPart} {\n  ${fieldName}${argPart}\n}`;
  }

  const operationArgs = field.args.map(arg => ({
    name: arg.name,
    type: typeRefToString(arg.type),
    required: arg.type.kind === 'NON_NULL',
    defaultValue: arg.defaultValue,
  }));

  return {
    name: opName,
    type: operationType,
    query,
    variables: JSON.stringify(defaultVars, null, 2),
    returnTypeName,
    availableFields,
    operationArgs,
  };
}
