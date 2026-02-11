import type {
  IntrospectedSchema, NLParseResult, GeneratedResolver, AIProviderConfig,
} from './types';
import { unwrapType, typeRefToString, levenshteinDistance } from './schemaDiffer';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  'for', 'of', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'into',
  'that', 'this', 'it', 'its', 'i', 'me', 'my', 'we', 'our',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any',
  'no', 'not', 'only', 'very', 'just', 'than', 'then', 'so', 'as',
  'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom',
  'please', 'show', 'give', 'tell', 'want', 'need', 'like',
]);

const INTENT_VERBS: Record<string, NLParseResult['intent']> = {
  get: 'get', fetch: 'get', find: 'get', show: 'get', retrieve: 'get', read: 'get', load: 'get', look: 'get',
  list: 'list', search: 'list', browse: 'list', query: 'list',
  create: 'create', add: 'create', new: 'create', insert: 'create', make: 'create', register: 'create',
  update: 'update', edit: 'update', modify: 'update', change: 'update', patch: 'update', set: 'update',
  delete: 'delete', remove: 'delete', destroy: 'delete', drop: 'delete',
};

/** Rule-based NL parser */
export function parseNaturalLanguage(input: string, schema?: IntrospectedSchema): NLParseResult {
  const tokens = input.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 0);
  const meaningfulTokens = tokens.filter(t => !STOPWORDS.has(t));

  // Detect intent
  let intent: NLParseResult['intent'] = 'unknown';
  for (const token of tokens) {
    if (INTENT_VERBS[token]) {
      intent = INTENT_VERBS[token];
      break;
    }
  }

  // Detect "all" modifier → list intent
  if (tokens.includes('all') || tokens.includes('every') || tokens.includes('many')) {
    if (intent === 'get' || intent === 'unknown') intent = 'list';
  }

  // Match entity from schema types
  let entityName = '';
  let bestScore = 0;
  const schemaTypeNames = schema ? Object.keys(schema.types) : [];

  for (const token of meaningfulTokens) {
    if (INTENT_VERBS[token]) continue;

    for (const typeName of schemaTypeNames) {
      const lower = typeName.toLowerCase();
      // Exact match
      if (token === lower) {
        if (typeName.length > entityName.length || bestScore < 1) {
          entityName = typeName;
          bestScore = 1;
        }
        continue;
      }
      // Plural strip: "users" → "user" → "User"
      if (token.endsWith('s') && token.slice(0, -1) === lower) {
        if (bestScore < 0.95) {
          entityName = typeName;
          bestScore = 0.95;
        }
        continue;
      }
      // Fuzzy match
      const dist = levenshteinDistance(token, lower);
      if (dist <= 2 && token.length > 2) {
        const score = 1 - dist / Math.max(token.length, lower.length);
        if (score > bestScore) {
          entityName = typeName;
          bestScore = score;
        }
      }
    }
  }

  // If no entity found, use first meaningful non-verb token
  if (!entityName) {
    const candidate = meaningfulTokens.find(t => !INTENT_VERBS[t]);
    if (candidate) {
      entityName = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  // Match fields
  const fieldHints: string[] = [];
  if (schema && entityName && schema.types[entityName]) {
    const typeFields = schema.types[entityName].fields.map(f => f.name);
    for (const token of meaningfulTokens) {
      if (INTENT_VERBS[token] || token === entityName.toLowerCase()) continue;
      for (const fieldName of typeFields) {
        if (fieldName.toLowerCase() === token || fieldName.toLowerCase().includes(token)) {
          if (!fieldHints.includes(fieldName)) fieldHints.push(fieldName);
        }
      }
    }
  }

  // Extract filters: "where X is Y" or "with X Y"
  const filters: Array<{ field: string; value: string }> = [];
  const filterMatch = input.match(/(?:where|with|whose|having)\s+(\w+)\s+(?:is|=|equals?)\s+"?([^"]+)"?/gi);
  if (filterMatch) {
    for (const m of filterMatch) {
      const parts = m.match(/(?:where|with|whose|having)\s+(\w+)\s+(?:is|=|equals?)\s+"?([^"]+)"?/i);
      if (parts) {
        filters.push({ field: parts[1], value: parts[2].trim().replace(/"$/, '') });
      }
    }
  }

  const confidence = bestScore > 0 && intent !== 'unknown' ? Math.min(bestScore, 0.95) : bestScore * 0.5;

  return { intent, entityName, fieldHints, filters, confidence };
}

/** Generate a GraphQL operation from parsed NL result */
export function generateFromNL(
  parsed: NLParseResult,
  schema: IntrospectedSchema,
): { query: string; variables: string; returnTypeName: string | null; availableFields: Array<{ name: string; type: string; hasSubFields: boolean }>; operationArgs: Array<{ name: string; type: string; required: boolean; defaultValue: string | null }> } {
  const rootType = (parsed.intent === 'create' || parsed.intent === 'update' || parsed.intent === 'delete')
    ? schema.mutationType
    : schema.queryType;

  if (!rootType) {
    const opType = parsed.intent === 'create' || parsed.intent === 'update' || parsed.intent === 'delete' ? 'mutation' : 'query';
    return { query: `${opType} {\n  # No ${opType} type found in schema\n}`, variables: '{}', returnTypeName: null, availableFields: [], operationArgs: [] };
  }

  // Find best matching root field
  const entityLower = parsed.entityName.toLowerCase();
  let bestField = rootType.fields[0];
  let bestFieldScore = 0;

  for (const field of rootType.fields) {
    const fieldLower = field.name.toLowerCase();

    // Exact entity match in field name
    if (fieldLower === entityLower || fieldLower === entityLower + 's' || fieldLower === entityLower.slice(0, -1)) {
      bestField = field;
      bestFieldScore = 10;
      break;
    }

    // Partial match
    if (fieldLower.includes(entityLower) || entityLower.includes(fieldLower)) {
      const score = 5;
      if (score > bestFieldScore) {
        bestField = field;
        bestFieldScore = score;
      }
    }

    // Intent-based prefix match
    const intentPrefix = parsed.intent === 'list' ? '' :
      parsed.intent === 'create' ? 'create' :
      parsed.intent === 'update' ? 'update' :
      parsed.intent === 'delete' ? 'delete' : '';
    if (intentPrefix && fieldLower.startsWith(intentPrefix) && fieldLower.includes(entityLower)) {
      bestField = field;
      bestFieldScore = 8;
    }
  }

  const opType = (parsed.intent === 'create' || parsed.intent === 'update' || parsed.intent === 'delete') ? 'mutation' : 'query';
  const opName = bestField.name.charAt(0).toUpperCase() + bestField.name.slice(1);

  // Build variable declarations and argument usage
  const varDecls: string[] = [];
  const argUsages: string[] = [];
  const defaultVars: Record<string, unknown> = {};

  for (const arg of bestField.args) {
    const typeStr = typeRefToString(arg.type);
    varDecls.push(`$${arg.name}: ${typeStr}`);
    argUsages.push(`${arg.name}: $${arg.name}`);

    // Set filter values if available
    const filterVal = parsed.filters.find(f => f.field.toLowerCase() === arg.name.toLowerCase());
    if (filterVal) {
      defaultVars[arg.name] = filterVal.value;
    } else {
      const inner = unwrapType(arg.type);
      if (inner.kind === 'SCALAR') {
        switch (inner.name) {
          case 'String': case 'ID': defaultVars[arg.name] = ''; break;
          case 'Int': defaultVars[arg.name] = 0; break;
          case 'Float': defaultVars[arg.name] = 0.0; break;
          case 'Boolean': defaultVars[arg.name] = false; break;
          default: defaultVars[arg.name] = null;
        }
      } else {
        defaultVars[arg.name] = null;
      }
    }
  }

  const varPart = varDecls.length > 0 ? `(${varDecls.join(', ')})` : '';
  const argPart = argUsages.length > 0 ? `(${argUsages.join(', ')})` : '';

  // Build selection set
  const returnType = unwrapType(bestField.type);
  let selectionSet = '';
  if (returnType.kind === 'OBJECT' && returnType.name && schema.types[returnType.name]) {
    const fields = schema.types[returnType.name].fields;
    let selectedFields: string[];
    if (parsed.fieldHints.length > 0) {
      // Always include id if available
      selectedFields = fields.filter(f => f.name === 'id').map(f => f.name);
      for (const hint of parsed.fieldHints) {
        if (!selectedFields.includes(hint)) selectedFields.push(hint);
      }
    } else {
      // Pick scalar fields up to 6
      selectedFields = fields
        .filter(f => {
          const inner = unwrapType(f.type);
          return inner.kind === 'SCALAR' || inner.kind === 'ENUM';
        })
        .slice(0, 6)
        .map(f => f.name);
    }
    selectionSet = ' {\n' + selectedFields.map(f => `    ${f}`).join('\n') + '\n  }';
  }

  const query = `${opType} ${opName}${varPart} {\n  ${bestField.name}${argPart}${selectionSet}\n}`;

  // Build metadata for Fields & Arguments panel
  const returnTypeName = returnType.name ?? null;
  const availableFields: Array<{ name: string; type: string; hasSubFields: boolean }> = [];
  if (returnType.kind === 'OBJECT' && returnType.name && schema.types[returnType.name]) {
    for (const f of schema.types[returnType.name].fields) {
      const inner = unwrapType(f.type);
      availableFields.push({
        name: f.name,
        type: typeRefToString(f.type),
        hasSubFields: inner.kind === 'OBJECT' || inner.kind === 'INTERFACE' || inner.kind === 'UNION',
      });
    }
  }
  const operationArgs: Array<{ name: string; type: string; required: boolean; defaultValue: string | null }> = bestField.args.map(a => ({
    name: a.name,
    type: typeRefToString(a.type),
    required: a.type.kind === 'NON_NULL',
    defaultValue: a.defaultValue,
  }));

  return { query, variables: JSON.stringify(defaultVars, null, 2), returnTypeName, availableFields, operationArgs };
}

/** Call an AI provider to generate a GraphQL query from natural language */
export async function callAIProvider(
  input: string,
  schema: IntrospectedSchema,
  config: AIProviderConfig,
  apiKey: string,
): Promise<{ query: string; variables: string }> {
  // Build compact schema summary
  const typeSummary: string[] = [];
  if (schema.queryType) {
    typeSummary.push('type Query {');
    for (const f of schema.queryType.fields) {
      const args = f.args.length > 0 ? `(${f.args.map(a => `${a.name}: ${typeRefToString(a.type)}`).join(', ')})` : '';
      typeSummary.push(`  ${f.name}${args}: ${typeRefToString(f.type)}`);
    }
    typeSummary.push('}');
  }
  if (schema.mutationType) {
    typeSummary.push('type Mutation {');
    for (const f of schema.mutationType.fields) {
      const args = f.args.length > 0 ? `(${f.args.map(a => `${a.name}: ${typeRefToString(a.type)}`).join(', ')})` : '';
      typeSummary.push(`  ${f.name}${args}: ${typeRefToString(f.type)}`);
    }
    typeSummary.push('}');
  }
  for (const [name, type] of Object.entries(schema.types)) {
    if (name === schema.queryType?.name || name === schema.mutationType?.name) continue;
    typeSummary.push(`type ${name} {`);
    for (const f of type.fields.slice(0, 10)) {
      typeSummary.push(`  ${f.name}: ${typeRefToString(f.type)}`);
    }
    if (type.fields.length > 10) typeSummary.push(`  ... ${type.fields.length - 10} more fields`);
    typeSummary.push('}');
  }

  const systemPrompt = `You are a GraphQL expert. Given a schema and a natural language request, generate a valid GraphQL operation (query or mutation) with variables. Respond with a JSON object containing "query" (GraphQL string) and "variables" (JSON object). Do not include any explanation, only valid JSON.`;
  const userPrompt = `Schema:\n${typeSummary.join('\n')}\n\nRequest: ${input}`;

  let responseText: string;

  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const json = await res.json() as { choices: Array<{ message: { content: string } }> };
    responseText = json.choices[0]?.message?.content ?? '';
  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
    const json = await res.json() as { content: Array<{ text: string }> };
    responseText = json.content[0]?.text ?? '';
  }

  // Parse JSON response — strip markdown fences if present
  const cleaned = responseText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned) as { query: string; variables: Record<string, unknown> };
  return {
    query: parsed.query,
    variables: JSON.stringify(parsed.variables ?? {}, null, 2),
  };
}

/** Generate a TypeScript resolver stub for a given operation */
export function generateResolverStub(
  schema: IntrospectedSchema,
  operationType: 'query' | 'mutation',
  fieldName: string,
): GeneratedResolver {
  const rootType = operationType === 'query' ? schema.queryType : schema.mutationType;
  if (!rootType) {
    return {
      code: `// No ${operationType} type in schema`,
      language: 'typescript',
      operationType,
      fieldName,
    };
  }

  const field = rootType.fields.find(f => f.name === fieldName);
  if (!field) {
    return {
      code: `// Field "${fieldName}" not found on ${operationType} type`,
      language: 'typescript',
      operationType,
      fieldName,
    };
  }

  const returnTypeStr = typeRefToString(field.type);
  const returnTypeInner = unwrapType(field.type);
  const returnTypeName = returnTypeInner.name ?? 'unknown';

  // Generate args interface
  const lines: string[] = [];

  if (field.args.length > 0) {
    lines.push(`interface ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}Args {`);
    for (const arg of field.args) {
      const tsType = graphqlTypeToTS(arg.type);
      lines.push(`  ${arg.name}: ${tsType};`);
    }
    lines.push('}');
    lines.push('');
  }

  // Generate resolver function
  const argsType = field.args.length > 0
    ? `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}Args`
    : 'Record<string, never>';

  lines.push(`// Resolver for ${operationType} { ${fieldName} }`);
  lines.push(`// Returns: ${returnTypeStr}`);
  lines.push(`export async function ${fieldName}(`);
  lines.push(`  _parent: unknown,`);
  lines.push(`  args: ${argsType},`);
  lines.push(`  context: { db: any },`);
  lines.push(`): Promise<${graphqlTypeToTS(field.type)}> {`);

  if (operationType === 'query') {
    if (field.args.some(a => a.name === 'id')) {
      lines.push(`  const result = await context.db.${returnTypeName.toLowerCase()}.findUnique({`);
      lines.push(`    where: { id: args.id },`);
      lines.push(`  });`);
      lines.push(`  if (!result) throw new Error('${returnTypeName} not found');`);
      lines.push(`  return result;`);
    } else {
      lines.push(`  const results = await context.db.${returnTypeName.toLowerCase()}.findMany({`);
      if (field.args.some(a => a.name === 'first')) {
        lines.push(`    take: args.first ?? 10,`);
      }
      lines.push(`  });`);
      lines.push(`  return results;`);
    }
  } else {
    // Mutation
    if (fieldName.toLowerCase().startsWith('create')) {
      lines.push(`  const result = await context.db.${returnTypeName.toLowerCase()}.create({`);
      lines.push(`    data: args.input ?? args,`);
      lines.push(`  });`);
      lines.push(`  return result;`);
    } else if (fieldName.toLowerCase().startsWith('update')) {
      lines.push(`  const result = await context.db.${returnTypeName.toLowerCase()}.update({`);
      lines.push(`    where: { id: args.id },`);
      lines.push(`    data: args.input ?? args,`);
      lines.push(`  });`);
      lines.push(`  return result;`);
    } else if (fieldName.toLowerCase().startsWith('delete')) {
      lines.push(`  const result = await context.db.${returnTypeName.toLowerCase()}.delete({`);
      lines.push(`    where: { id: args.id },`);
      lines.push(`  });`);
      lines.push(`  return result;`);
    } else {
      lines.push(`  // TODO: Implement ${fieldName} logic`);
      lines.push(`  throw new Error('Not implemented');`);
    }
  }

  lines.push('}');

  return {
    code: lines.join('\n'),
    language: 'typescript',
    operationType,
    fieldName,
  };
}

function graphqlTypeToTS(ref: import('./types').SchemaTypeRef): string {
  if (ref.kind === 'NON_NULL') return graphqlTypeToTS(ref.ofType!);
  if (ref.kind === 'LIST') return `Array<${graphqlTypeToTS(ref.ofType!)}>`;
  if (ref.kind === 'SCALAR') {
    switch (ref.name) {
      case 'String': case 'ID': return 'string';
      case 'Int': case 'Float': return 'number';
      case 'Boolean': return 'boolean';
      default: return 'unknown';
    }
  }
  return ref.name ?? 'unknown';
}
