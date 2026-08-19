// OpenTelemetry MUST initialise before any instrumented module (HTTP/Nest) is imported, so this is
// the very first import. It is a no-op unless OTEL is explicitly enabled, and self-registers its
// own SIGTERM/SIGINT span flush (see tracing.ts).
import './tracing';
import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { loadConfig } from '@singha/config';
import { API_VERSION } from '@singha/contracts';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProd = process.env.NODE_ENV === 'production';

  // Security headers (anti-clone retrofit doc 02). The API returns JSON/SSE only,
  // so lock the document CSP right down, deny framing, drop the referrer and remove
  // the server fingerprint. HSTS only in production (behind TLS). CORP is
  // cross-origin so the CORS-gated browser fetch below is never blocked.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      hsts: isProd ? { maxAge: 15_552_000, includeSubDomains: true } : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  // helmet already hides X-Powered-By; disable it at the Express layer too.
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // Behind the Railway edge — trust one proxy hop so the real client IP reaches
  // rate limiting and HSTS.
  app.set('trust proxy', 1);

  // Explicit request-body limits (doc 02). Media uploads go direct-to-storage via
  // signed URLs, so the API only ever parses small JSON/urlencoded commands.
  app.useBodyParser('json', { limit: '512kb' });
  app.useBodyParser('urlencoded', { limit: '512kb', extended: true });

  // Versioned API surface (docs/16). Liveness/readiness probes stay at the root.
  app.setGlobalPrefix(`api/${API_VERSION}`, {
    exclude: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
      // The enriched catalogue owns its own absolute /api/v2 path (docs 07).
      { path: 'api/v2/catalogue', method: RequestMethod.GET },
      { path: 'api/v2/catalogue/:id', method: RequestMethod.GET },
      // Buyer command-centre projection owns its own absolute /api/v2 path (doc 05).
      { path: 'api/v2/me/dashboard', method: RequestMethod.GET },
      // Dashboard-pilot instrumentation shares the absolute /api/v2/me path (doc 09).
      { path: 'api/v2/me/analytics', method: RequestMethod.POST },
      // Unified Singha Cockpit owns the absolute /api/v2/me/cockpit path (unified-identity pass).
      { path: 'api/v2/me/cockpit', method: RequestMethod.GET },
      { path: 'api/v2/me/cockpit/account-health', method: RequestMethod.GET },
      { path: 'api/v2/me/cockpit/ask', method: RequestMethod.POST },
    ],
  });
  app.enableShutdownHooks();

  // CORS so the Vercel-hosted web can call the API (bearer tokens, no cookies).
  const origins = config.http.corsOrigins;
  app.enableCors({ origin: origins.includes('*') ? true : origins });

  // Respect the platform's PORT (Railway/Render/etc.); bind all interfaces.
  const port = Number(process.env.PORT) || config.http.apiPort;
  await app.listen(port, '0.0.0.0');
  new Logger('bootstrap').log(`Singha API listening on :${port} (prefix /api/${API_VERSION})`);
}

void bootstrap();
