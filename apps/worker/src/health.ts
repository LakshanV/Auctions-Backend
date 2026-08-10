import { createServer } from 'node:http';
import type { Logger } from '@singha/observability';

/** Tiny liveness endpoint so the worker is observable even when idle. */
export function startHealthServer(port: number, log: Logger): () => void {
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'worker' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => log.info(`worker health on :${port}`));
  return () => server.close();
}
