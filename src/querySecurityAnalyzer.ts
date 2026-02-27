import type { IntrospectedSchema, SecurityAnalysisResult, SecurityIssue, SecurityLevel } from './types';
import { extractFieldsFromQuery, unwrapType } from './schemaDiffer';

const SENSITIVE_PATTERN = /password|secret|token|apiKey|api_key|ssn|creditCard|credit_card|cvv/i;
const DEPTH_CRITICAL_THRESHOLD = 5;
const DEPTH_WARNING_THRESHOLD = 3;
const ALIAS_ABUSE_THRESHOLD = 3;
const SEVERITY_DEDUCTIONS: Record<string, number> = { critical: 30, warning: 15, info: 5 };

export function analyzeQuerySecurity(queryText: string, schema?: IntrospectedSchema): SecurityAnalysisResult {
  const analysis = extractFieldsFromQuery(queryText, schema);
  const issues: SecurityIssue[] = [];

  // 1. Depth attack detection
  if (analysis.maxDepth > DEPTH_CRITICAL_THRESHOLD) {
    issues.push({
      rule: 'depth-attack',
      severity: 'critical',
      message: `Query depth ${analysis.maxDepth} exceeds safe limit (5). This may cause exponential server load.`,
    });
  } else if (analysis.maxDepth > DEPTH_WARNING_THRESHOLD) {
    issues.push({
      rule: 'depth-attack',
      severity: 'warning',
      message: `Query depth ${analysis.maxDepth} is moderately deep. Consider flattening if possible.`,
    });
  }

  // 2. Circular reference detection (walk type paths in schema)
  if (schema) {
    const visited = new Set<string>();
    for (const fieldRef of analysis.extractedFields) {
      if (!fieldRef.typeName) continue;
      const objType = schema.types[fieldRef.typeName];
      if (!objType) continue;
      const schemaField = objType.fields.find(f => f.name === fieldRef.fieldName);
      if (!schemaField) continue;
      const innerType = unwrapType(schemaField.type);
      if (innerType.name && visited.has(innerType.name)) {
        issues.push({
          rule: 'circular-reference',
          severity: 'warning',
          message: `Type "${innerType.name}" appears multiple times in query path — potential circular reference.`,
          fieldPath: fieldRef.path.join('.'),
        });
      }
      if (innerType.name) visited.add(innerType.name);
    }
  }

  // 3. Sensitive field detection
  for (const fieldRef of analysis.extractedFields) {
    if (SENSITIVE_PATTERN.test(fieldRef.fieldName)) {
      issues.push({
        rule: 'sensitive-field',
        severity: 'warning',
        message: `Field "${fieldRef.fieldName}" may contain sensitive data. Ensure proper authorization.`,
        fieldPath: fieldRef.path.join('.'),
      });
    }
  }

  // 4. Alias abuse detection (3+ aliases for the same field name)
  const aliasGroups = new Map<string, number>();
  for (const fieldRef of analysis.extractedFields) {
    if (fieldRef.aliasOf) {
      const count = (aliasGroups.get(fieldRef.fieldName) ?? 0) + 1;
      aliasGroups.set(fieldRef.fieldName, count);
    }
  }
  for (const [fieldName, count] of aliasGroups) {
    if (count >= ALIAS_ABUSE_THRESHOLD) {
      issues.push({
        rule: 'alias-abuse',
        severity: 'critical',
        message: `Field "${fieldName}" is aliased ${count} times. This can be used to bypass rate limiting.`,
      });
    }
  }

  // 5. Missing pagination on list fields
  if (schema) {
    for (const listPath of analysis.listFieldPaths) {
      const fieldName = listPath[listPath.length - 1];
      // Find the parent type to check for pagination args
      const parentField = analysis.extractedFields.find(
        f => f.fieldName === fieldName && f.path.length === listPath.length
      );
      if (parentField && parentField.typeName) {
        const objType = schema.types[parentField.typeName];
        if (objType) {
          const schemaField = objType.fields.find(f => f.name === fieldName);
          if (schemaField) {
            const hasPageArg = schemaField.args.some(
              a => /^(first|last|limit|take|pageSize|page_size)$/i.test(a.name)
            );
            if (!hasPageArg) {
              issues.push({
                rule: 'missing-pagination',
                severity: 'info',
                message: `List field "${fieldName}" has no pagination arguments (first/limit/take). Unbounded lists risk large responses.`,
                fieldPath: listPath.join('.'),
              });
            }
          }
        }
      }
    }
  }

  // Score: start 100, deduct per issue severity
  let score = 100;
  for (const issue of issues) {
    score -= SEVERITY_DEDUCTIONS[issue.severity] ?? 0;
  }
  score = Math.max(0, score);

  let level: SecurityLevel;
  if (score >= 70) level = 'safe';
  else if (score >= 40) level = 'warning';
  else level = 'unsafe';

  const summary = issues.length === 0
    ? 'No security issues detected'
    : `${issues.length} issue(s) found — score ${score}/100`;

  return { level, score, issues, summary };
}
