import type { IntrospectedSchema, SchemaObjectType, SchemaField, SchemaTypeRef, SchemaArgument } from './types';

/**
 * Parse a schema input string (auto-detect SDL vs JSON introspection result).
 */
export function parseSchemaInput(text: string): IntrospectedSchema {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseIntrospectionJSON(trimmed);
  }
  return parseSDL(trimmed);
}

/**
 * Parse a JSON introspection result into IntrospectedSchema.
 * Handles both `{ data: { __schema: ... } }` and `{ __schema: ... }` formats.
 */
function parseIntrospectionJSON(json: string): IntrospectedSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON. Check your schema input.');
  }

  const obj = parsed as Record<string, unknown>;
  let schemaObj: Record<string, unknown>;

  if (obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;
    if (data.__schema) {
      schemaObj = data.__schema as Record<string, unknown>;
    } else {
      throw new Error('JSON has "data" but no "__schema" field.');
    }
  } else if (obj.__schema) {
    schemaObj = obj.__schema as Record<string, unknown>;
  } else {
    throw new Error('JSON must contain __schema (or data.__schema).');
  }

  const types: Record<string, SchemaObjectType> = {};
  const inputTypes: Record<string, SchemaObjectType> = {};
  let queryType: SchemaObjectType | null = null;
  let mutationType: SchemaObjectType | null = null;

  const queryTypeName = (schemaObj.queryType as { name?: string })?.name ?? null;
  const mutationTypeName = (schemaObj.mutationType as { name?: string })?.name ?? null;

  const rawTypes = schemaObj.types as Array<Record<string, unknown>> | undefined;
  if (rawTypes && Array.isArray(rawTypes)) {
    for (const t of rawTypes) {
      const name = t.name as string;
      if (!name || name.startsWith('__')) continue;
      const kind = t.kind as string;

      if (kind === 'OBJECT' || kind === 'INTERFACE') {
        const fields = ((t.fields as Array<Record<string, unknown>>) ?? []).map(parseJSONField);
        const objType: SchemaObjectType = { name, fields };
        types[name] = objType;
        if (name === queryTypeName) queryType = objType;
        if (name === mutationTypeName) mutationType = objType;
      } else if (kind === 'INPUT_OBJECT') {
        const fields = ((t.inputFields as Array<Record<string, unknown>>) ?? []).map(parseJSONInputField);
        inputTypes[name] = { name, fields };
      }
    }
  }

  return {
    queryType,
    mutationType,
    types,
    inputTypes,
    fetchedAt: new Date().toISOString(),
    endpoint: 'preview',
  };
}

function parseJSONField(f: Record<string, unknown>): SchemaField {
  return {
    name: f.name as string,
    description: (f.description as string) ?? null,
    args: ((f.args as Array<Record<string, unknown>>) ?? []).map(a => ({
      name: a.name as string,
      type: a.type as SchemaTypeRef,
      defaultValue: (a.defaultValue as string) ?? null,
    })),
    type: f.type as SchemaTypeRef,
  };
}

function parseJSONInputField(f: Record<string, unknown>): SchemaField {
  return {
    name: f.name as string,
    description: (f.description as string) ?? null,
    args: [],
    type: f.type as SchemaTypeRef,
  };
}

/**
 * Lightweight SDL parser using regex. Supports type, input, enum.
 * Not full spec — suggests JSON introspection if SDL parsing fails.
 */
function parseSDL(sdl: string): IntrospectedSchema {
  const types: Record<string, SchemaObjectType> = {};
  const inputTypes: Record<string, SchemaObjectType> = {};
  let queryType: SchemaObjectType | null = null;
  let mutationType: SchemaObjectType | null = null;

  // Match type/input/enum blocks
  const blockRegex = /\b(type|input|enum|interface)\s+(\w+)(?:\s+implements\s+[^{]*)?\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(sdl)) !== null) {
    const kind = match[1];
    const name = match[2];
    const body = match[3];

    if (name.startsWith('__')) continue;

    if (kind === 'enum') {
      // Enum values — store as type with no fields
      types[name] = { name, fields: [] };
      continue;
    }

    const fields = parseSDLFields(body);
    const objType: SchemaObjectType = { name, fields };

    if (kind === 'input') {
      inputTypes[name] = objType;
    } else {
      types[name] = objType;
    }

    if (name === 'Query') queryType = objType;
    else if (name === 'Mutation') mutationType = objType;
  }

  if (Object.keys(types).length === 0 && Object.keys(inputTypes).length === 0) {
    throw new Error('Could not parse SDL. No types found. Try pasting JSON introspection result instead.');
  }

  return {
    queryType,
    mutationType,
    types,
    inputTypes,
    fetchedAt: new Date().toISOString(),
    endpoint: 'preview',
  };
}

function parseSDLFields(body: string): SchemaField[] {
  const fields: SchemaField[] = [];
  // Match: fieldName(args): ReturnType or fieldName: ReturnType
  // Use [\w\[\]!]+ for the type to correctly handle single-line SDL
  const fieldRegex = /(\w+)(?:\(([^)]*)\))?\s*:\s*([\w\[\]!]+)/g;
  let match: RegExpExecArray | null;

  while ((match = fieldRegex.exec(body)) !== null) {
    const name = match[1];
    const argsStr = match[2] ?? '';
    const typeStr = match[3].trim();

    const args: SchemaArgument[] = [];
    if (argsStr.trim()) {
      // Parse args: name: Type, name: Type
      const argRegex = /(\w+)\s*:\s*([^,)]+)/g;
      let argMatch: RegExpExecArray | null;
      while ((argMatch = argRegex.exec(argsStr)) !== null) {
        args.push({
          name: argMatch[1],
          type: sdlTypeToRef(argMatch[2].trim()),
          defaultValue: null,
        });
      }
    }

    fields.push({
      name,
      description: null,
      args,
      type: sdlTypeToRef(typeStr),
    });
  }

  return fields;
}

function sdlTypeToRef(typeStr: string): SchemaTypeRef {
  let s = typeStr.trim();

  // Handle NonNull
  if (s.endsWith('!')) {
    return {
      kind: 'NON_NULL',
      name: null,
      ofType: sdlTypeToRef(s.slice(0, -1)),
    };
  }

  // Handle List
  if (s.startsWith('[') && s.endsWith(']')) {
    return {
      kind: 'LIST',
      name: null,
      ofType: sdlTypeToRef(s.slice(1, -1)),
    };
  }

  // Scalars
  const scalars = ['String', 'Int', 'Float', 'Boolean', 'ID'];
  const kind = scalars.includes(s) ? 'SCALAR' : 'OBJECT';

  return {
    kind: kind as SchemaTypeRef['kind'],
    name: s,
    ofType: null,
  };
}
