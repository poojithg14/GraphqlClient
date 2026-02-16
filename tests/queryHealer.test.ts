import { describe, it, expect } from 'vitest';
import { healQuery, extractAutoFixes } from '../src/queryHealer';
import type { QueryImpactEntry } from '../src/types';

describe('healQuery', () => {
  it('renames a field', () => {
    const query = `query {\n  user {\n    userName\n  }\n}`;
    const healed = healQuery(query, [
      { oldField: 'userName', newField: 'username', lineNumber: 0 },
    ]);
    expect(healed).toContain('username');
    expect(healed).not.toContain('userName');
  });

  it('removes a field', () => {
    const query = `query {\n  user {\n    id\n    deprecatedField\n    name\n  }\n}`;
    const healed = healQuery(query, [
      { oldField: 'deprecatedField', newField: '', lineNumber: 0 },
    ]);
    expect(healed).not.toContain('deprecatedField');
    expect(healed).toContain('id');
    expect(healed).toContain('name');
  });

  it('removes a field with sub-selection block', () => {
    const query = `query {\n  user {\n    id\n    oldField {\n      nested\n    }\n    name\n  }\n}`;
    const healed = healQuery(query, [
      { oldField: 'oldField', newField: '', lineNumber: 0 },
    ]);
    expect(healed).not.toContain('oldField');
    expect(healed).not.toContain('nested');
    expect(healed).toContain('name');
  });

  it('preserves alias during rename', () => {
    const query = `query {\n  myAlias: userName {\n    id\n  }\n}`;
    const healed = healQuery(query, [
      { oldField: 'userName', newField: 'username', lineNumber: 0 },
    ]);
    expect(healed).toContain('myAlias: username');
  });

  it('applies multiple fixes', () => {
    const query = `query {\n  user {\n    oldName\n    oldAge\n  }\n}`;
    const healed = healQuery(query, [
      { oldField: 'oldName', newField: 'name', lineNumber: 0 },
      { oldField: 'oldAge', newField: 'age', lineNumber: 0 },
    ]);
    expect(healed).toContain('name');
    expect(healed).toContain('age');
    expect(healed).not.toContain('oldName');
    expect(healed).not.toContain('oldAge');
  });

  it('returns unchanged query when no fixes needed', () => {
    const query = `query { user { id } }`;
    const healed = healQuery(query, []);
    expect(healed).toBe(query);
  });
});

describe('extractAutoFixes', () => {
  it('extracts rename fix from high-confidence entry', () => {
    const entry: QueryImpactEntry = {
      requestId: 'r1',
      requestName: 'Test',
      collectionName: 'C1',
      folderName: 'F1',
      status: 'broken',
      brokenFields: [
        {
          typeName: 'User',
          fieldName: 'userName',
          changeType: 'renamed',
          suggestedReplacement: 'username',
          confidence: 0.9,
        },
      ],
      autoFixAvailable: true,
    };
    const fixes = extractAutoFixes(entry);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].oldField).toBe('userName');
    expect(fixes[0].newField).toBe('username');
  });

  it('extracts removal fix for removed fields', () => {
    const entry: QueryImpactEntry = {
      requestId: 'r1',
      requestName: 'Test',
      collectionName: 'C1',
      folderName: 'F1',
      status: 'broken',
      brokenFields: [
        {
          typeName: 'User',
          fieldName: 'legacy',
          changeType: 'removed',
          suggestedReplacement: null,
          confidence: 1,
        },
      ],
      autoFixAvailable: true,
    };
    const fixes = extractAutoFixes(entry);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].newField).toBe('');
  });

  it('skips low-confidence renames', () => {
    const entry: QueryImpactEntry = {
      requestId: 'r1',
      requestName: 'Test',
      collectionName: 'C1',
      folderName: 'F1',
      status: 'broken',
      brokenFields: [
        {
          typeName: 'User',
          fieldName: 'foo',
          changeType: 'renamed',
          suggestedReplacement: 'bar',
          confidence: 0.5,
        },
      ],
      autoFixAvailable: false,
    };
    const fixes = extractAutoFixes(entry);
    expect(fixes).toHaveLength(0);
  });

  it('skips type_changed entries', () => {
    const entry: QueryImpactEntry = {
      requestId: 'r1',
      requestName: 'Test',
      collectionName: 'C1',
      folderName: 'F1',
      status: 'affected',
      brokenFields: [
        {
          typeName: 'User',
          fieldName: 'age',
          changeType: 'type_changed',
          suggestedReplacement: 'String',
          confidence: 1,
        },
      ],
      autoFixAvailable: false,
    };
    const fixes = extractAutoFixes(entry);
    expect(fixes).toHaveLength(0);
  });
});
