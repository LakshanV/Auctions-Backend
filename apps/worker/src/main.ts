import { loadConfig } from '@singha/config';
import { getPrisma } from '@singha/database';
import { createLogger } from '@singha/observability';
import { processOutboxBatch, type OutboxRepo } from './outbox-dispatcher';
import { startHealthServer } from './health';

const config = loadConfig();
const log = createLogger({ name: 'worker', level: config.logLevel });

const SWEEP_INTERVAL_MS = 5000;
const BATCH_SIZE = 50;

async function main(): Promise<void> {
  const stopHealth = startHealthServer(config.http.workerMetricsPort, log);

  // Phase 0: with no Redis the worker idles (health only). Queues start once a
  // REDIS_URL is provided — no crash-loop, no hard dependency during dev.
  if (!config.redis.enabled) {
    log.warn('REDIS_URL not set — worker idle (Phase 0 no-op). Outbox sweeping disabled.');
    return;
  }

  const { Queue, Worker } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null });
  const prisma = getPrisma();

  const repo: OutboxRepo = {
    async fetchPending(limit) {
      const rows = await prisma.outboxEvent.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      return rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        name: r.name,
        aggregateId: r.aggregateId,
        payload: r.payload,
      }));
    },
    async markDispatched(id, at) {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: 'dispatched', dispatchedAt: at },
      });
    },
    async markFailed(id, error) {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: 'failed', attempts: { increment: 1 }, lastError: error },
      });
    },
  };

  const queue = new Queue('outbox', { connection });
  await queue.add(
    'sweep',
    {},
    { repeat: { every: SWEEP_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 100 },
  );

  const worker = new Worker(
    'outbox',
    async () => {
      // Phase 0 publisher is a stub (structured log). Real channel/event-bus
      // adapters are wired in later phases; consumers stay idempotent.
      const result = await processOutboxBatch(
        repo,
        async (row) => {
          log.info({ event: row.name, eventId: row.eventId }, 'outbox dispatch (stub)');
        },
        BATCH_SIZE,
      );
      if (result.dispatched || result.failed) log.info(result, 'outbox swept');
    },
    { connection },
  );

  worker.on('failed', (job, err) =>
    log.error({ jobId: job?.id, err: String(err) }, 'outbox job failed'),
  );
  log.info('Outbox dispatcher started');

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await queue.close();
    await connection.quit();
    stopHealth();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  log.error({ err: String(error) }, 'worker failed to start');
  process.exit(1);
});
