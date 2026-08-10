/** Pure health payloads (no DI/decorators) so they are trivially unit-testable. */
export interface LivenessResult {
  status: 'ok';
  service: string;
  ts: string;
}

export function liveness(service = 'api', now: Date = new Date()): LivenessResult {
  return { status: 'ok', service, ts: now.toISOString() };
}

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  checks: Record<string, 'ok' | 'fail'>;
}

/** Aggregate boolean checks into a readiness verdict. */
export function readiness(checks: Record<string, boolean>): ReadinessResult {
  const mapped: Record<string, 'ok' | 'fail'> = {};
  for (const [name, healthy] of Object.entries(checks)) {
    mapped[name] = healthy ? 'ok' : 'fail';
  }
  const status = Object.values(checks).every(Boolean) ? 'ok' : 'degraded';
  return { status, checks: mapped };
}
