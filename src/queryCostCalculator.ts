import type { IntrospectedSchema, QueryCostBreakdown } from './types';
import { extractFieldsFromQuery } from './schemaDiffer';

export function calculateQueryCost(queryText: string, schema?: IntrospectedSchema): QueryCostBreakdown {
  const analysis = extractFieldsFromQuery(queryText, schema);
  const explanation: string[] = [];

  const fieldCount = analysis.extractedFields.length;
  const fieldCost = fieldCount * 1;
  explanation.push(`${fieldCount} fields (${fieldCost} cost)`);

  const listCount = analysis.listFieldPaths.length;
  const listMultiplier = listCount * 10;
  if (listCount > 0) {
    explanation.push(`${listCount} list field(s) (+${listMultiplier} cost)`);
  }

  // Detect nested lists (lists inside lists)
  let nestedListCount = 0;
  for (let i = 0; i < analysis.listFieldPaths.length; i++) {
    for (let j = 0; j < analysis.listFieldPaths.length; j++) {
      if (i === j) continue;
      const outer = analysis.listFieldPaths[i];
      const inner = analysis.listFieldPaths[j];
      if (inner.length > outer.length &&
          outer.every((seg, idx) => inner[idx] === seg)) {
        nestedListCount++;
      }
    }
  }
  const nestedListPenalty = nestedListCount * 100;
  if (nestedListCount > 0) {
    explanation.push(`${nestedListCount} nested list(s) (+${nestedListPenalty} cost)`);
  }

  const depth = analysis.maxDepth;
  let depthPenalty = 0;
  if (depth > 3) {
    depthPenalty = Math.pow(depth - 3, 2) * 5;
    explanation.push(`Depth ${depth} (penalty +${depthPenalty})`);
  }

  const totalCost = fieldCost + listMultiplier + depthPenalty + nestedListPenalty;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (totalCost < 50) riskLevel = 'low';
  else if (totalCost < 200) riskLevel = 'medium';
  else if (totalCost < 500) riskLevel = 'high';
  else riskLevel = 'critical';

  explanation.push(`Total: ${totalCost} (${riskLevel} risk)`);

  return {
    totalCost,
    fieldCount,
    maxDepth: depth,
    listMultiplier,
    depthPenalty,
    riskLevel,
    explanation,
  };
}
