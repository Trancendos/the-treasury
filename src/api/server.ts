/**
 * The Treasury — REST API Server
 * Resource management, allocation, capacity planning
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors'; import helmet from 'helmet'; import morgan from 'morgan';
import { logger } from '../utils/logger';
import { resourceManager } from '../resources/resource-manager';
import type { ResourceType } from '../resources/resource-manager';

export function createServer(): express.Application {
  const app = express();
  app.use(helmet()); app.use(cors()); app.use(express.json({ limit: '1mb' }));
  app.use(morgan('combined', { stream: { write: (m: string) => logger.info({ http: m.trim() }, 'HTTP') } }));

  app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'the-treasury', uptime: process.uptime(), timestamp: new Date().toISOString(), ...resourceManager.getStats() }));
  app.get('/metrics', (_req, res) => { const mem = process.memoryUsage(); res.json({ service: 'the-treasury', uptime: process.uptime(), memory: { heapUsedMb: Math.round(mem.heapUsed/1024/1024) }, stats: resourceManager.getStats() }); });

  app.get('/api/v1/resources', (req, res) => res.json({ resources: resourceManager.getResources(req.query.type as ResourceType) }));
  app.post('/api/v1/resources', (req, res) => { try { res.status(201).json(resourceManager.addResource(req.body)); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/v1/resources/:id', (req, res) => { const r = resourceManager.getResource(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' }); return res.json(r); });

  app.get('/api/v1/allocations', (req, res) => res.json({ allocations: resourceManager.getAllocations(req.query.requesterId as string) }));
  app.post('/api/v1/allocations', (req, res) => { const a = resourceManager.allocate(req.body); if (!a) return res.status(409).json({ error: 'Insufficient capacity or resource not found' }); return res.status(201).json(a); });
  app.post('/api/v1/allocations/:id/release', (req, res) => { const ok = resourceManager.release(req.params.id); if (!ok) return res.status(404).json({ error: 'Allocation not found or not active' }); return res.json({ released: true }); });

  app.get('/api/v1/reports', (_req, res) => res.json({ reports: resourceManager.getReports() }));
  app.post('/api/v1/reports', (_req, res) => res.status(201).json(resourceManager.generateCapacityReport()));
  app.get('/api/v1/stats', (_req, res) => res.json(resourceManager.getStats()));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => { logger.error({ err }, 'Unhandled error'); res.status(500).json({ error: err.message }); });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}