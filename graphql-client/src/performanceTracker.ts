import type { PerformanceStats, PerformanceAnomaly } from './types';

/**
 * Update performance stats using Welford's online algorithm for running mean + variance.
 */
export function updatePerformanceStats(
  existing: PerformanceStats | undefined,
  requestId: string,
  responseTime: number,
  schemaTimestamp?: string,
): PerformanceStats {
  if (!existing) {
    return {
      requestId,
      count: 1,
      totalTime: responseTime,
      avgTime: responseTime,
      minTime: responseTime,
      maxTime: responseTime,
      sumSquaredDiff: 0,
      stddev: 0,
      lastResponseTime: responseTime,
      lastTimestamp: new Date().toISOString(),
      lastSchemaChangeTimestamp: schemaTimestamp,
    };
  }

  const count = existing.count + 1;
  const totalTime = existing.totalTime + responseTime;
  const oldAvg = existing.avgTime;
  const newAvg = oldAvg + (responseTime - oldAvg) / count;

  // Welford's: update sum of squared differences from mean
  const sumSquaredDiff = existing.sumSquaredDiff + (responseTime - oldAvg) * (responseTime - newAvg);
  const variance = count > 1 ? sumSquaredDiff / (count - 1) : 0;
  const stddev = Math.sqrt(variance);

  return {
    requestId,
    count,
    totalTime,
    avgTime: newAvg,
    minTime: Math.min(existing.minTime, responseTime),
    maxTime: Math.max(existing.maxTime, responseTime),
    sumSquaredDiff,
    stddev,
    lastResponseTime: responseTime,
    lastTimestamp: new Date().toISOString(),
    lastSchemaChangeTimestamp: schemaTimestamp || existing.lastSchemaChangeTimestamp,
  };
}

/**
 * Detect if the latest response time is an anomaly (> 2x rolling average).
 * Requires at least 3 data points for meaningful detection.
 */
export function detectAnomaly(
  stats: PerformanceStats,
  latestTime: number,
): PerformanceAnomaly | null {
  if (stats.count < 3) return null;

  const ratio = latestTime / stats.avgTime;
  if (ratio <= 2) return null;

  // Schema correlation: check if schema changed within 24h
  let schemaCorrelation = false;
  let schemaCorrelationMessage: string | undefined;
  if (stats.lastSchemaChangeTimestamp) {
    const schemaTime = new Date(stats.lastSchemaChangeTimestamp).getTime();
    const now = Date.now();
    const hoursDiff = (now - schemaTime) / (1000 * 60 * 60);
    if (hoursDiff <= 24) {
      schemaCorrelation = true;
      schemaCorrelationMessage = `Schema was updated ${hoursDiff < 1 ? 'less than an hour' : Math.round(hoursDiff) + 'h'} ago — this may be related.`;
    }
  }

  const message = `Response time ${latestTime}ms is ${ratio.toFixed(1)}x the average (${Math.round(stats.avgTime)}ms over ${stats.count} executions).`;

  return {
    requestId: stats.requestId,
    latestTime,
    avgTime: stats.avgTime,
    ratio,
    message,
    schemaCorrelation,
    schemaCorrelationMessage,
  };
}
