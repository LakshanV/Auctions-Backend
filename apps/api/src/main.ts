import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@singha/config';
import { API_VERSION } from '@singha/contracts';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  // Versioned API surface (docs/16). Liveness/readiness probes stay at the root.
  app.setGlobalPrefix(`api/${API_VERSION}`, {
    exclude: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
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
