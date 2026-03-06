/**
 * The Treasury — REST API Server
 * Resource management, allocation, capacity planning
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors'; import helmet from 'helmet'; import morgan from 'morgan';
import { logger } from '../utils/logger';
import { resourceManager } from '../resources/resource-manager';
import type { ResourceType } from '../resources/resource-manager';


// ============================================================================
// IAM MIDDLEWARE — Trancendos 2060 Standard (TRN-PROD-001)
// ============================================================================
import { createHash, createHmac } from 'crypto';

const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const IAM_ALGORITHM = process.env.JWT_ALGORITHM || 'HS512';
const SERVICE_ID = 'treasury';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'treasury.agent.local';

function sha512Audit(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64 + '='.repeat((4 - b64.length % 4) % 4), 'base64').toString('utf8');
}

interface JWTClaims {
  sub: string; email?: string; role?: string;
  active_role_level?: number; permissions?: string[];
  exp?: number; jti?: string;
}

function verifyIAMToken(token: string): JWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const header = JSON.parse(b64urlDecode(h));
    const alg = header.alg === 'HS512' ? 'sha512' : 'sha256';
    const expected = createHmac(alg, IAM_JWT_SECRET)
      .update(`${h}.${p}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (expected !== sig) return null;
    const claims = JSON.parse(b64urlDecode(p)) as JWTClaims;
    if (claims.exp && Date.now() / 1000 > claims.exp) return null;
    return claims;
  } catch { return null; }
}

function requireIAMLevel(maxLevel: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Authentication required', service: SERVICE_ID }); return; }
    const claims = verifyIAMToken(token);
    if (!claims) { res.status(401).json({ error: 'Invalid or expired token', service: SERVICE_ID }); return; }
    const level = claims.active_role_level ?? 6;
    if (level > maxLevel) {
      console.log(JSON.stringify({ level: 'audit', decision: 'DENY', service: SERVICE_ID,
        principal: claims.sub, requiredLevel: maxLevel, actualLevel: level, path: req.path,
        integrityHash: sha512Audit(`DENY:${claims.sub}:${req.path}:${Date.now()}`),
        timestamp: new Date().toISOString() }));
      res.status(403).json({ error: 'Insufficient privilege level', required: maxLevel, actual: level });
      return;
    }
    (req as any).principal = claims;
    next();
  };
}

function iamRequestMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Service-Id', SERVICE_ID);
  res.setHeader('X-Mesh-Address', MESH_ADDRESS);
  res.setHeader('X-IAM-Version', '1.0');
  next();
}

function iamHealthStatus() {
  return {
    iam: {
      version: '1.0', algorithm: IAM_ALGORITHM,
      status: IAM_JWT_SECRET ? 'configured' : 'unconfigured',
      meshAddress: MESH_ADDRESS,
      routingProtocol: process.env.MESH_ROUTING_PROTOCOL || 'static_port',
      cryptoMigrationPath: 'hmac_sha512 → ml_kem (2030) → hybrid_pqc (2040) → slh_dsa (2060)',
    },
  };
}
// ============================================================================
// END IAM MIDDLEWARE
// ============================================================================

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