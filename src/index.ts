/**
 * The Treasury — Main Entry Point
 * Resource management and capacity planning for the Trancendos mesh.
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */
import { logger } from './utils/logger';
import { createServer } from './api/server';
import { resourceManager } from './resources/resource-manager';

const PORT = parseInt(process.env.PORT || '3015', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap(): Promise<void> {
  logger.info({ service: 'the-treasury', port: PORT }, 'The Treasury bootstrapping...');
  const stats = resourceManager.getStats();
  logger.info({ resources: stats.totalResources, zeroCostCompliant: stats.zeroCostCompliant }, 'Resource manager verified');
  const app = createServer();
  const server = app.listen(PORT, HOST, () => logger.info({ host: HOST, port: PORT }, 'The Treasury listening — resources accounted for'));
  const shutdown = (signal: string) => { logger.info({ signal }, 'Shutdown'); server.close(() => { logger.info('The Treasury shutdown complete'); process.exit(0); }); setTimeout(() => process.exit(1), 10_000); };
  process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught exception'); shutdown('uncaughtException'); });
  process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled rejection'); });
}
bootstrap().catch((err) => { logger.error({ err }, 'Bootstrap failed'); process.exit(1); });