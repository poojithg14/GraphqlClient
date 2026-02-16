import { describe, it, expect } from 'vitest';
import { analyzeQuerySecurity } from '../src/querySecurityAnalyzer';

describe('analyzeQuerySecurity', () => {
  it('returns safe for a simple shallow query', () => {
    const query = `query { user { id name } }`;
    const result = analyzeQuerySecurity(query);
    expect(result.level).toBe('safe');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('flags critical depth attack for depth > 5', () => {
    const query = `
      query {
        a {
          b {
            c {
              d {
                e {
                  f {
                    g
                  }
                }
              }
            }
          }
        }
      }
    `;
    const result = analyzeQuerySecurity(query);
    const depthIssue = result.issues.find(i => i.rule === 'depth-attack');
    expect(depthIssue).toBeDefined();
    expect(depthIssue!.severity).toBe('critical');
  });

  it('flags moderate depth warning for depth 4-5', () => {
    const query = `
      query {
        a {
          b {
            c {
              d {
                e
              }
            }
          }
        }
      }
    `;
    const result = analyzeQuerySecurity(query);
    const depthIssue = result.issues.find(i => i.rule === 'depth-attack');
    expect(depthIssue).toBeDefined();
    expect(depthIssue!.severity).toBe('warning');
  });

  it('flags sensitive field names', () => {
    const query = `query { user { id password apiKey } }`;
    const result = analyzeQuerySecurity(query);
    const sensitive = result.issues.filter(i => i.rule === 'sensitive-field');
    expect(sensitive.length).toBeGreaterThanOrEqual(2);
  });

  it('flags alias abuse when 3+ aliases for same field', () => {
    const query = `
      query {
        a1: user { id }
        a2: user { id }
        a3: user { id }
      }
    `;
    const result = analyzeQuerySecurity(query);
    const aliasIssue = result.issues.find(i => i.rule === 'alias-abuse');
    expect(aliasIssue).toBeDefined();
    expect(aliasIssue!.severity).toBe('critical');
  });

  it('returns no issues summary for clean query', () => {
    const query = `query { user { id name email } }`;
    const result = analyzeQuerySecurity(query);
    expect(result.summary).toBe('No security issues detected');
  });

  it('score never goes below 0', () => {
    const query = `
      query {
        a {
          b {
            c {
              d {
                e {
                  f {
                    password
                    secret
                    token
                    apiKey
                    creditCard
                    cvv
                  }
                }
              }
            }
          }
        }
      }
    `;
    const result = analyzeQuerySecurity(query);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('deducts 30 per critical, 15 per warning, 5 per info', () => {
    // Query with one depth warning (score: 100 - 15 = 85)
    const query = `
      query {
        a {
          b {
            c {
              d
            }
          }
        }
      }
    `;
    const result = analyzeQuerySecurity(query);
    expect(result.score).toBe(85);
  });
});
