import { describe, it, expect } from 'vitest';
import { calculateQueryCost } from '../src/queryCostCalculator';

describe('calculateQueryCost', () => {
  it('returns low risk for a simple query', () => {
    const query = `query { user { id name } }`;
    const result = calculateQueryCost(query);
    expect(result.riskLevel).toBe('low');
    expect(result.totalCost).toBeGreaterThan(0);
    expect(result.fieldCount).toBeGreaterThanOrEqual(3);
  });

  it('applies depth penalty for deep queries (depth > 3)', () => {
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
    const result = calculateQueryCost(query);
    expect(result.maxDepth).toBeGreaterThan(3);
    expect(result.depthPenalty).toBeGreaterThan(0);
  });

  it('has no depth penalty for shallow queries', () => {
    const query = `query { user { id } }`;
    const result = calculateQueryCost(query);
    expect(result.depthPenalty).toBe(0);
  });

  it('explanation ends with Total line', () => {
    const query = `query { user { id } }`;
    const result = calculateQueryCost(query);
    expect(result.explanation.length).toBeGreaterThanOrEqual(1);
    expect(result.explanation[result.explanation.length - 1]).toContain('Total:');
  });

  it('assigns higher risk to queries with many fields', () => {
    const fields = Array.from({ length: 60 }, (_, i) => `field${i}`).join('\n    ');
    const query = `query {\n  root {\n    ${fields}\n  }\n}`;
    const result = calculateQueryCost(query);
    expect(result.riskLevel).not.toBe('low');
  });

  it('fieldCount matches extracted fields', () => {
    const query = `query { user { id name email } }`;
    const result = calculateQueryCost(query);
    expect(result.fieldCount).toBe(4); // user + id + name + email
  });
});
