import type { QueryHealFix, QueryImpactEntry } from './types';

/** Apply auto-heal fixes to a query string by replacing field names at specific lines */
export function healQuery(queryText: string, fixes: QueryHealFix[]): string {
  const lines = queryText.split('\n');

  // Sort fixes by line number descending to avoid offset issues
  const sorted = [...fixes].sort((a, b) => b.lineNumber - a.lineNumber);

  for (const fix of sorted) {
    const lineIdx = fix.lineNumber - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    const line = lines[lineIdx];
    // Replace the field name, preserving alias syntax, args, and sub-selections
    // Match: optional alias before, the field name, optional args/braces after
    const pattern = new RegExp(
      `(\\s*)` +                       // leading whitespace
      `(?:(\\w+)\\s*:\\s*)?` +         // optional alias
      `\\b(${escapeRegex(fix.oldField)})\\b` +  // the old field name
      `(\\s*(?:\\(|\\{|$))`,           // followed by args, brace, or end
    );

    const match = line.match(pattern);
    if (match) {
      const indent = match[1];
      const alias = match[2];
      const trailer = match[4];

      let replacement: string;
      if (alias) {
        // Keep the alias, replace the real field name
        replacement = `${indent}${alias}: ${fix.newField}${trailer}`;
      } else {
        replacement = `${indent}${fix.newField}${trailer}`;
      }
      lines[lineIdx] = line.replace(match[0], replacement);
    }
  }

  return lines.join('\n');
}

/** Extract auto-fixable entries from an impact entry */
export function extractAutoFixes(entry: QueryImpactEntry): QueryHealFix[] {
  const fixes: QueryHealFix[] = [];
  for (const change of entry.brokenFields) {
    if (change.changeType === 'renamed' && change.suggestedReplacement && change.confidence > 0.7) {
      // We'll need line numbers from the query analysis — use 0 as placeholder
      // The actual line number should be populated by the caller using extractFieldsFromQuery
      fixes.push({
        oldField: change.fieldName,
        newField: change.suggestedReplacement,
        lineNumber: 0,
      });
    }
  }
  return fixes;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
