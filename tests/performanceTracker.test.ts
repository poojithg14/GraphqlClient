import { describe, it, expect } from 'vitest';
import { updatePerformanceStats, detectAnomaly } from '../src/performanceTracker';

describe('updatePerformanceStats', () => {
  it('initializes stats from scratch', () => {
    const stats = updatePerformanceStats(undefined, 'req-1', 150);
    expect(stats.count).toBe(1);
    expect(stats.avgTime).toBe(150);
    expect(stats.minTime).toBe(150);
    expect(stats.maxTime).toBe(150);
    expect(stats.stddev).toBe(0);
    expect(stats.requestId).toBe('req-1');
  });

  it('updates running average correctly', () => {
    let stats = updatePerformanceStats(undefined, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 200);
    expect(stats.count).toBe(2);
    expect(stats.avgTime).toBe(150);
    expect(stats.totalTime).toBe(300);
  });

  it('tracks min and max', () => {
    let stats = updatePerformanceStats(undefined, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 50);
    stats = updatePerformanceStats(stats, 'req-1', 200);
    expect(stats.minTime).toBe(50);
    expect(stats.maxTime).toBe(200);
  });

  it('computes stddev correctly for known values', () => {
    let stats = updatePerformanceStats(undefined, 'req-1', 10);
    stats = updatePerformanceStats(stats, 'req-1', 20);
    stats = updatePerformanceStats(stats, 'req-1', 30);
    // mean = 20, sample variance = ((10-20)^2 + (20-20)^2 + (30-20)^2) / 2 = 100
    // stddev = 10
    expect(stats.avgTime).toBeCloseTo(20);
    expect(stats.stddev).toBeCloseTo(10);
  });

  it('preserves schema change timestamp', () => {
    const ts = '2025-01-01T00:00:00Z';
    let stats = updatePerformanceStats(undefined, 'req-1', 100, ts);
    expect(stats.lastSchemaChangeTimestamp).toBe(ts);
    stats = updatePerformanceStats(stats, 'req-1', 200);
    expect(stats.lastSchemaChangeTimestamp).toBe(ts);
  });

  it('updates schema change timestamp when provided', () => {
    const ts1 = '2025-01-01T00:00:00Z';
    const ts2 = '2025-02-01T00:00:00Z';
    let stats = updatePerformanceStats(undefined, 'req-1', 100, ts1);
    stats = updatePerformanceStats(stats, 'req-1', 200, ts2);
    expect(stats.lastSchemaChangeTimestamp).toBe(ts2);
  });
});

describe('detectAnomaly', () => {
  it('returns null when count < 3', () => {
    const stats = updatePerformanceStats(undefined, 'req-1', 100);
    expect(detectAnomaly(stats, 500)).toBeNull();
  });

  it('returns null when ratio <= 2', () => {
    let stats = updatePerformanceStats(undefined, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    expect(detectAnomaly(stats, 200)).toBeNull();
  });

  it('detects anomaly when response time > 2x average', () => {
    let stats = updatePerformanceStats(undefined, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    const anomaly = detectAnomaly(stats, 500);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.ratio).toBe(5);
    expect(anomaly!.message).toContain('5.0x');
  });

  it('reports schema correlation when schema changed recently', () => {
    const recentTs = new Date().toISOString();
    let stats = updatePerformanceStats(undefined, 'req-1', 100, recentTs);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    const anomaly = detectAnomaly(stats, 500);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.schemaCorrelation).toBe(true);
    expect(anomaly!.schemaCorrelationMessage).toBeDefined();
  });

  it('does not report schema correlation for old schema changes', () => {
    const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
    let stats = updatePerformanceStats(undefined, 'req-1', 100, oldTs);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    stats = updatePerformanceStats(stats, 'req-1', 100);
    const anomaly = detectAnomaly(stats, 500);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.schemaCorrelation).toBe(false);
  });
});
