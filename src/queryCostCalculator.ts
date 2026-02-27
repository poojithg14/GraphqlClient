import type { IntrospectedSchema, QueryCostBreakdown } from './types';
import { extractFieldsFromQuery } from './schemaDiffer';

const LIST_FIELD_COST = 10;
const NESTED_LIST_COST = 100;
const DEPTH_PENALTY_MULTIPLIER = 5;
const DEPTH_PENALTY_THRESHOLD = 3;
const RISK_THRESHOLD_LOW = 50;
const RISK_THRESHOLD_MEDIUM = 200;
const RISK_THRESHOLD_HIGH = 500;

export function calculateQueryCost(queryText: string, schema?: IntrospectedSchema): QueryCostBreakdown {
  const analysis = extractFieldsFromQuery(queryText, schema);
  const explanation: string[] = [];

  const fieldCount = analysis.extractedFields.length;
  const fieldCost = fieldCount * 1;
  explanation.push(`${fieldCount} fields (${fieldCost} cost)`);

  const listCount = analysis.listFieldPaths.length;
  const listMultiplier = listCount * LIST_FIELD_COST;
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
  const nestedListPenalty = nestedListCount * NESTED_LIST_COST;
  if (nestedListCount > 0) {
    explanation.push(`${nestedListCount} nested list(s) (+${nestedListPenalty} cost)`);
  }

  const depth = analysis.maxDepth;
  let depthPenalty = 0;
  if (depth > DEPTH_PENALTY_THRESHOLD) {
    depthPenalty = Math.pow(depth - DEPTH_PENALTY_THRESHOLD, 2) * DEPTH_PENALTY_MULTIPLIER;
    explanation.push(`Depth ${depth} (penalty +${depthPenalty})`);
  }

  const totalCost = fieldCost + listMultiplier + depthPenalty + nestedListPenalty;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (totalCost < RISK_THRESHOLD_LOW) riskLevel = 'low';
  else if (totalCost < RISK_THRESHOLD_MEDIUM) riskLevel = 'medium';
  else if (totalCost < RISK_THRESHOLD_HIGH) riskLevel = 'high';
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
