/**
 * OpenTelemetry tracing bootstrap (CRM/OSS Completion Pass §12 — recommended OSS observability).
 *
 * Vendor-neutral by construction: spans are exported over OTLP/HTTP to whatever collector the
 * operator points at (Jaeger, Tempo, Grafana Alloy, an OTel Collector, a SaaS OTLP endpoint) via
 * the STANDARD `OTEL_EXPORTER_OTLP_*` environment variables — the exporter is the single
 * replaceable seam, there is no vendor SDK and no lock-in. OpenTelemetry is Apache-2.0.
 *
 * Disabled by default. It turns on only when `OTEL_ENABLED=true` OR an OTLP endpoint is configured
 * (`OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`). When off, the SDK is never
 * started — no exporter connections, no span processing, effectively zero runtime cost.
 *
 * This module MUST be imported before any instrumented module (HTTP, Nest) is loaded, so it is the
 * very first import in `main.ts`. It initialises synchronously at import time for exactly that
 * reason — a later async start would miss modules already required by Nest/Express.
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

function tracingEnabled(): boolean {
  if (process.env.OTEL_ENABLED === 'true') return true;
  if (process.env.OTEL_ENABLED === 'false') return false;
  // Convention: configuring any OTLP endpoint is an explicit opt-in.
  return Boolean(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  );
}

let sdk: NodeSDK | null = null;

if (tracingEnabled()) {
  try {
    if (process.env.OTEL_LOG_LEVEL === 'debug') {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }
    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'singha-api',
        [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION ?? '0.0.0',
      }),
      // No URL passed → the exporter reads the standard OTEL_EXPORTER_OTLP_* env (endpoint,
      // headers, protocol). Point it at any OTLP collector to change backends — nothing else moves.
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [
        // Focused, low-overhead set for an API: inbound/outbound HTTP + Nest controller/handler
        // spans. Health/readiness probes are dropped so they don't flood the trace backend.
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return url.startsWith('/healthz') || url.startsWith('/readyz');
          },
        }),
        new NestInstrumentation(),
      ],
    });
    sdk.start();
    // Best-effort span flush on shutdown, independent of Nest's own shutdown hooks (they close the
    // app; this flushes the tracer). Non-conflicting — never re-raises the signal or exits.
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        void shutdownTracing();
      });
    }
    // eslint-disable-next-line no-console
    console.log('[otel] tracing started (OTLP exporter)');
  } catch (error) {
    // Observability must never take the API down. A misconfigured exporter degrades to no tracing.
    sdk = null;
    // eslint-disable-next-line no-console
    console.error('[otel] tracing failed to start; continuing without it:', error);
  }
}

/** Flush + stop the tracer on shutdown. No-op when tracing was never started. */
export async function shutdownTracing(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch {
    /* best-effort flush on shutdown */
  }
}

/** Whether tracing is active this process (for /healthz-style introspection). */
export function tracingActive(): boolean {
  return sdk !== null;
}
