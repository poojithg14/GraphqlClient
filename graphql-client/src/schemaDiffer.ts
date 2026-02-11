import type {
  IntrospectedSchema, SchemaTypeRef, SchemaObjectType,
  SchemaDiffResult, SchemaFieldChange, ExtractedFieldRef, QueryAnalysis,
} from './types';

/** Unwrap NON_NULL / LIST wrappers to get the named type */
export function unwrapType(ref: SchemaTypeRef): SchemaTypeRef {
  let current = ref;
  while (current.ofType && (current.kind === 'NON_NULL' || current.kind === 'LIST')) {
    current = current.ofType;
  }
  return current;
}

/** Get a display string for a type reference (e.g. "[User!]!") */
export function typeRefToString(ref: SchemaTypeRef): string {
  if (ref.kind === 'NON_NULL') {
    return typeRefToString(ref.ofType!) + '!';
  }
  if (ref.kind === 'LIST') {
    return '[' + typeRefToString(ref.ofType!) + ']';
  }
  return ref.name ?? 'Unknown';
}

/** Check if a type ref contains a LIST wrapper */
function containsList(ref: SchemaTypeRef): boolean {
  let current: SchemaTypeRef | null = ref;
  while (current) {
    if (current.kind === 'LIST') return true;
    current = current.ofType;
  }
  return false;
}

/** Simple Levenshtein distance (DP) */
export function levenshteinDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= la; i++) {
    dp[i] = [i];
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = i === 0 ? j : 0;
    }
  }
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[la][lb];
}

/** Normalized Levenshtein similarity (0 = no match, 1 = identical) */
function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

/** Compare two schemas and return a diff result */
export function diffSchemas(oldSchema: IntrospectedSchema, newSchema: IntrospectedSchema): SchemaDiffResult {
  const addedTypes: string[] = [];
  const removedTypes: string[] = [];
  const fieldChanges: SchemaFieldChange[] = [];

  const oldTypeNames = new Set(Object.keys(oldSchema.types));
  const newTypeNames = new Set(Object.keys(newSchema.types));

  // Find added/removed types
  for (const name of newTypeNames) {
    if (!oldTypeNames.has(name)) addedTypes.push(name);
  }
  for (const name of oldTypeNames) {
    if (!newTypeNames.has(name)) removedTypes.push(name);
  }

  // Compare fields on shared types
  for (const typeName of oldTypeNames) {
    if (!newTypeNames.has(typeName)) continue;
    const oldType = oldSchema.types[typeName];
    const newType = newSchema.types[typeName];

    const oldFieldMap = new Map(oldType.fields.map(f => [f.name, f]));
    const newFieldMap = new Map(newType.fields.map(f => [f.name, f]));

    // Check for removed/changed fields
    for (const [fieldName, oldField] of oldFieldMap) {
      const newField = newFieldMap.get(fieldName);
      if (!newField) {
        // Field removed — check for rename
        const rename = findRename(fieldName, oldField.type, newType, oldFieldMap);
        if (rename) {
          fieldChanges.push({
            typeName,
            fieldName,
            changeType: 'renamed',
            suggestedReplacement: rename.name,
            confidence: rename.confidence,
          });
        } else {
          fieldChanges.push({
            typeName,
            fieldName,
            changeType: 'removed',
            suggestedReplacement: null,
            confidence: 1,
          });
        }
      } else {
        // Check type change
        if (typeRefToString(oldField.type) !== typeRefToString(newField.type)) {
          fieldChanges.push({
            typeName,
            fieldName,
            changeType: 'type_changed',
            suggestedReplacement: typeRefToString(newField.type),
            confidence: 1,
          });
        }
        // Check args change
        const oldArgs = oldField.args.map(a => a.name + ':' + typeRefToString(a.type)).sort().join(',');
        const newArgs = newField.args.map(a => a.name + ':' + typeRefToString(a.type)).sort().join(',');
        if (oldArgs !== newArgs) {
          fieldChanges.push({
            typeName,
            fieldName,
            changeType: 'args_changed',
            suggestedReplacement: null,
            confidence: 1,
          });
        }
      }
    }
  }

  const hasBreakingChanges = removedTypes.length > 0 ||
    fieldChanges.some(c => c.changeType === 'removed' || c.changeType === 'renamed' || c.changeType === 'type_changed');

  const parts: string[] = [];
  if (addedTypes.length > 0) parts.push(`${addedTypes.length} types added`);
  if (removedTypes.length > 0) parts.push(`${removedTypes.length} types removed`);
  const breaking = fieldChanges.filter(c => c.changeType === 'removed' || c.changeType === 'renamed');
  if (breaking.length > 0) parts.push(`${breaking.length} field(s) removed/renamed`);
  const summary = parts.length > 0 ? parts.join(', ') : 'No changes detected';

  return { addedTypes, removedTypes, fieldChanges, hasBreakingChanges, summary };
}

function findRename(
  oldFieldName: string,
  oldType: SchemaTypeRef,
  newType: SchemaObjectType,
  oldFieldMap: Map<string, { name: string; type: SchemaTypeRef }>,
): { name: string; confidence: number } | null {
  const oldTypeStr = typeRefToString(oldType);
  let bestMatch: { name: string; confidence: number } | null = null;

  for (const newField of newType.fields) {
    // Skip fields that existed in the old type
    if (oldFieldMap.has(newField.name)) continue;
    // Must have the same return type
    if (typeRefToString(newField.type) !== oldTypeStr) continue;
    const similarity = nameSimilarity(oldFieldName, newField.name);
    if (similarity >= 0.6 && (!bestMatch || similarity > bestMatch.confidence)) {
      bestMatch = { name: newField.name, confidence: similarity };
    }
  }

  return bestMatch;
}

/** Extract field references from a GraphQL query string (lightweight state-machine parser) */
export function extractFieldsFromQuery(queryText: string, schema?: IntrospectedSchema): QueryAnalysis {
  const lines = queryText.split('\n');
  const extractedFields: ExtractedFieldRef[] = [];
  const listFieldPaths: string[][] = [];
  const variableDefinitions: Array<{ name: string; type: string }> = [];

  let operationType = 'query';
  let rootFieldName = '';
  let braceDepth = 0;
  let maxDepth = 0;
  const typeStack: string[] = [];
  const pathStack: string[] = [];
  let inVarDef = false;
  let parenDepth = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Detect operation type
    const opMatch = trimmed.match(/^(query|mutation|subscription)\s+(\w+)?/);
    if (opMatch && braceDepth === 0) {
      operationType = opMatch[1];
      // Check for variable definitions on this line
      inVarDef = trimmed.includes('(');
      if (inVarDef) {
        extractVarDefs(trimmed, variableDefinitions);
        if (trimmed.includes(')')) inVarDef = false;
      }
    }

    if (inVarDef && !opMatch) {
      extractVarDefs(trimmed, variableDefinitions);
      if (trimmed.includes(')')) inVarDef = false;
      continue;
    }

    // Process characters for brace tracking and field extraction
    let i = 0;
    while (i < line.length) {
      const ch = line[i];

      if (ch === '#') break; // rest is comment

      if (ch === '(') { parenDepth++; i++; continue; }
      if (ch === ')') { parenDepth--; i++; continue; }
      if (parenDepth > 0) { i++; continue; }

      if (ch === '{') {
        braceDepth++;
        maxDepth = Math.max(maxDepth, braceDepth);
        // Push current field onto type stack
        if (pathStack.length > 0 && schema) {
          const parentType = typeStack[typeStack.length - 1];
          const currentField = pathStack[pathStack.length - 1];
          if (parentType) {
            const objType = schema.types[parentType];
            if (objType) {
              const f = objType.fields.find(fld => fld.name === currentField);
              if (f) {
                const inner = unwrapType(f.type);
                if (inner.name) typeStack.push(inner.name);
                else typeStack.push('');
              } else {
                typeStack.push('');
              }
            } else {
              typeStack.push('');
            }
          } else {
            typeStack.push('');
          }
        } else if (braceDepth === 1 && schema) {
          // Root level: push query/mutation type
          const rootType = operationType === 'mutation' ? schema.mutationType : schema.queryType;
          typeStack.push(rootType?.name ?? '');
        } else if (!schema) {
          typeStack.push('');
        }
        i++;
        continue;
      }

      if (ch === '}') {
        braceDepth--;
        if (typeStack.length > 0) typeStack.pop();
        if (pathStack.length > 0) pathStack.pop();
        i++;
        continue;
      }

      // Try to extract a field name
      if (/[a-zA-Z_]/.test(ch) && parenDepth === 0) {
        let fieldName = '';
        const startI = i;
        while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
          fieldName += line[i];
          i++;
        }

        // Skip keywords and fragment spreads
        if (fieldName === 'query' || fieldName === 'mutation' || fieldName === 'subscription' ||
            fieldName === 'fragment' || fieldName === 'on' || fieldName === '__typename') {
          continue;
        }

        // Skip if preceded by "..." (fragment spread)
        const before = line.substring(0, startI).trimEnd();
        if (before.endsWith('...')) continue;

        // Check for alias (field: realField)
        const afterField = line.substring(i).trimStart();
        let aliasOf: string | undefined;
        if (afterField.startsWith(':')) {
          // This is an alias — the real field name follows
          const rest = afterField.substring(1).trimStart();
          const realMatch = rest.match(/^([a-zA-Z_]\w*)/);
          if (realMatch) {
            aliasOf = fieldName;
            fieldName = realMatch[1];
          }
        }

        if (braceDepth > 0 && fieldName) {
          // Determine parent type
          const parentTypeName = typeStack.length > 0 ? typeStack[typeStack.length - 1] : '';

          if (braceDepth === 1 && !rootFieldName) {
            rootFieldName = fieldName;
          }

          const currentPath = [...pathStack, fieldName];
          pathStack.push(fieldName);

          extractedFields.push({
            path: currentPath,
            typeName: parentTypeName,
            fieldName,
            lineNumber: lineIdx + 1,
            aliasOf,
          });

          // Check if this is a list field
          if (schema && parentTypeName) {
            const objType = schema.types[parentTypeName];
            if (objType) {
              const schemaField = objType.fields.find(f => f.name === fieldName);
              if (schemaField && containsList(schemaField.type)) {
                listFieldPaths.push(currentPath);
              }
            }
          }

          // If next non-whitespace is NOT '{', pop from path stack (leaf field)
          const restAfterField = line.substring(i).trimStart();
          if (!restAfterField.startsWith('{') && !restAfterField.startsWith('(')) {
            pathStack.pop();
          }
        }
        continue;
      }

      i++;
    }
  }

  return {
    operationType,
    rootFieldName,
    extractedFields,
    maxDepth,
    listFieldPaths,
    variableDefinitions,
  };
}

function extractVarDefs(line: string, defs: Array<{ name: string; type: string }>): void {
  const varRegex = /\$(\w+)\s*:\s*([^,)]+)/g;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(line)) !== null) {
    defs.push({ name: match[1], type: match[2].trim() });
  }
}
