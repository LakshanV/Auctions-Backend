/**
 * Minimal metrics abstraction (docs/18 observability). Phase 0 ships an
 * in-memory registry behind an interface so a Prometheus/OTel exporter can be
 * dropped in later without touching call sites.
 */
export interface Counter {
  inc(value?: number): void;
  get(): number;
}

export interface MetricsRegistry {
  counter(name: string): Counter;
  snapshot(): Record<string, number>;
}

export function createMetricsRegistry(): MetricsRegistry {
  const counters = new Map<string, number>();
  return {
    counter(name: string): Counter {
      if (!counters.has(name)) counters.set(name, 0);
      return {
        inc(value = 1) {
          counters.set(name, (counters.get(name) ?? 0) + value);
        },
        get() {
          return counters.get(name) ?? 0;
        },
      };
    },
    snapshot() {
      return Object.fromEntries(counters);
    },
  };
}
