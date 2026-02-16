import type { QueryHealFix, QueryImpactEntry } from './types';

/** Apply auto-heal fixes to a query string by replacing or removing field names */
export function healQuery(queryText: string, fixes: QueryHealFix[]): string {
  let result = queryText;

  // Handle removals first (newField === ''), then renames
  const removals = fixes.filter(f => f.newField === '');
  const renames = fixes.filter(f => f.newField !== '');

  // Apply removals
  for (const fix of removals) {
    result = removeFieldFromQuery(result, fix.oldField);
  }

  // Apply renames on remaining lines
  if (renames.length > 0) {
    const lines = result.split('\n');
    const sorted = [...renames].sort((a, b) => b.lineNumber - a.lineNumber);

    for (const fix of sorted) {
      // When lineNumber is 0 (placeholder), search all lines for the field
      const searchAll = fix.lineNumber === 0;
      for (let i = 0; i < lines.length; i++) {
        if (!searchAll && i !== fix.lineNumber - 1) continue;

        const line = lines[i];
        const pattern = new RegExp(
          `(\\s*)` +
          `(?:(\\w+)\\s*:\\s*)?` +
          `\\b(${escapeRegex(fix.oldField)})\\b` +
          `(\\s*(?:\\(|\\{|$))`,
        );

        const match = line.match(pattern);
        if (match) {
          const indent = match[1];
          const alias = match[2];
          const trailer = match[4];

          let replacement: string;
          if (alias) {
            replacement = `${indent}${alias}: ${fix.newField}${trailer}`;
          } else {
            replacement = `${indent}${fix.newField}${trailer}`;
          }
          lines[i] = line.replace(match[0], replacement);
          if (!searchAll) break;
          break; // Only replace first occurrence per fix
        }
      }
    }
    result = lines.join('\n');
  }

  return result;
}

/** Remove a field (and its sub-selection block if any) from a query string */
function removeFieldFromQuery(queryText: string, fieldName: string): string {
  const lines = queryText.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Check if this line contains the field to remove
    const pattern = new RegExp(
      `^(\\s*)` +
      `(?:\\w+\\s*:\\s*)?` +
      `\\b${escapeRegex(fieldName)}\\b` +
      `\\s*(?:\\(.*?\\))?\\s*`,
    );
    const match = line.match(pattern);

    if (match) {
      // Check if the field has a sub-selection block on the same line or next lines
      const afterField = line.slice(match[0].length);
      if (afterField.trim().startsWith('{')) {
        // Sub-selection starts on same line — skip until matching closing brace
        let depth = 0;
        for (let j = line.indexOf('{', match[0].length); j < line.length; j++) {
          if (line[j] === '{') depth++;
          else if (line[j] === '}') depth--;
        }
        i++;
        while (i < lines.length && depth > 0) {
          for (const ch of lines[i]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          i++;
        }
        continue;
      } else if (line.trim().endsWith('{')) {
        // Sub-selection brace at end of line
        let depth = 1;
        i++;
        while (i < lines.length && depth > 0) {
          for (const ch of lines[i]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          i++;
        }
        continue;
      } else {
        // Simple scalar field — just skip this line
        i++;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

/** Extract auto-fixable entries from an impact entry */
export function extractAutoFixes(entry: QueryImpactEntry): QueryHealFix[] {
  const fixes: QueryHealFix[] = [];
  for (const change of entry.brokenFields) {
    if (change.changeType === 'renamed' && change.suggestedReplacement && change.confidence > 0.7) {
      fixes.push({
        oldField: change.fieldName,
        newField: change.suggestedReplacement,
        lineNumber: 0,
      });
    } else if (change.changeType === 'removed') {
      // Use empty newField as sentinel for removal
      fixes.push({
        oldField: change.fieldName,
        newField: '',
        lineNumber: 0,
      });
    }
  }
  return fixes;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
