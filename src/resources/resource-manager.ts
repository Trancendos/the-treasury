/**
 * The Treasury — Resource Manager
 *
 * Manages computational resources, service allocations, capacity planning,
 * and resource optimization across the Trancendos mesh.
 * Works alongside Dorris AI (financial) for zero-cost resource governance.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export type ResourceType = 'compute' | 'memory' | 'storage' | 'network' | 'api_quota' | 'agent_slot';
export type AllocationStatus = 'active' | 'reserved' | 'released' | 'expired';

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  totalCapacity: number;
  allocatedCapacity: number;
  reservedCapacity: number;
  unit: string;
  cost: number;           // Always 0 under zero-cost mandate
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceAllocation {
  id: string;
  resourceId: string;
  requesterId: string;
  amount: number;
  status: AllocationStatus;
  purpose: string;
  expiresAt?: Date;
  allocatedAt: Date;
  releasedAt?: Date;
}

export interface CapacityReport {
  id: string;
  generatedAt: Date;
  resources: Array<{
    resource: Resource;
    utilizationPercent: number;
    availableCapacity: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    recommendation: string;
  }>;
  overallUtilization: number;
  recommendations: string[];
}

export interface TreasuryStats {
  totalResources: number;
  totalAllocations: number;
  activeAllocations: number;
  totalCapacity: Record<ResourceType, number>;
  totalAllocated: Record<ResourceType, number>;
  zeroCostCompliant: boolean;
}

export class ResourceManager {
  private resources: Map<string, Resource> = new Map();
  private allocations: Map<string, ResourceAllocation> = new Map();
  private reports: CapacityReport[] = [];

  constructor() {
    this.seedDefaultResources();
    logger.info({ resources: this.resources.size }, 'ResourceManager initialised');
  }

  addResource(params: Omit<Resource, 'id' | 'allocatedCapacity' | 'reservedCapacity' | 'createdAt' | 'updatedAt'>): Resource {
    const resource: Resource = { ...params, id: uuidv4(), allocatedCapacity: 0, reservedCapacity: 0, cost: 0, createdAt: new Date(), updatedAt: new Date() };
    this.resources.set(resource.id, resource);
    logger.info({ resourceId: resource.id, name: resource.name, type: resource.type }, 'Resource added');
    return resource;
  }

  getResource(id: string): Resource | undefined { return this.resources.get(id); }
  getResources(type?: ResourceType): Resource[] {
    const all = Array.from(this.resources.values());
    return type ? all.filter(r => r.type === type) : all;
  }

  allocate(params: { resourceId: string; requesterId: string; amount: number; purpose: string; ttlMs?: number }): ResourceAllocation | null {
    const resource = this.resources.get(params.resourceId);
    if (!resource) return null;
    const available = resource.totalCapacity - resource.allocatedCapacity - resource.reservedCapacity;
    if (params.amount > available) {
      logger.warn({ resourceId: params.resourceId, requested: params.amount, available }, 'Insufficient resource capacity');
      return null;
    }
    const allocation: ResourceAllocation = {
      id: uuidv4(), resourceId: params.resourceId, requesterId: params.requesterId,
      amount: params.amount, status: 'active', purpose: params.purpose,
      expiresAt: params.ttlMs ? new Date(Date.now() + params.ttlMs) : undefined,
      allocatedAt: new Date(),
    };
    resource.allocatedCapacity += params.amount;
    resource.updatedAt = new Date();
    this.allocations.set(allocation.id, allocation);
    logger.info({ allocationId: allocation.id, resourceId: params.resourceId, amount: params.amount, requesterId: params.requesterId }, 'Resource allocated');
    return allocation;
  }

  release(allocationId: string): boolean {
    const allocation = this.allocations.get(allocationId);
    if (!allocation || allocation.status !== 'active') return false;
    const resource = this.resources.get(allocation.resourceId);
    if (resource) { resource.allocatedCapacity = Math.max(0, resource.allocatedCapacity - allocation.amount); resource.updatedAt = new Date(); }
    allocation.status = 'released'; allocation.releasedAt = new Date();
    logger.info({ allocationId, resourceId: allocation.resourceId }, 'Resource released');
    return true;
  }

  getAllocations(requesterId?: string): ResourceAllocation[] {
    const all = Array.from(this.allocations.values());
    return requesterId ? all.filter(a => a.requesterId === requesterId) : all;
  }

  generateCapacityReport(): CapacityReport {
    const resourceReports = Array.from(this.resources.values()).map(r => {
      const utilization = r.totalCapacity > 0 ? ((r.allocatedCapacity + r.reservedCapacity) / r.totalCapacity) * 100 : 0;
      const available = r.totalCapacity - r.allocatedCapacity - r.reservedCapacity;
      let recommendation = 'Capacity nominal';
      if (utilization > 90) recommendation = `CRITICAL: ${r.name} at ${utilization.toFixed(0)}% capacity — scale up immediately`;
      else if (utilization > 75) recommendation = `WARNING: ${r.name} at ${utilization.toFixed(0)}% capacity — plan for scaling`;
      else if (utilization < 10) recommendation = `${r.name} underutilised at ${utilization.toFixed(0)}% — consider consolidation`;
      return { resource: r, utilizationPercent: Math.round(utilization), availableCapacity: available, trend: 'stable' as const, recommendation };
    });

    const overallUtilization = resourceReports.length > 0
      ? resourceReports.reduce((s, r) => s + r.utilizationPercent, 0) / resourceReports.length : 0;

    const report: CapacityReport = {
      id: uuidv4(), generatedAt: new Date(), resources: resourceReports,
      overallUtilization: Math.round(overallUtilization),
      recommendations: resourceReports.filter(r => r.utilizationPercent > 75 || r.utilizationPercent < 10).map(r => r.recommendation),
    };
    this.reports.push(report);
    return report;
  }

  getReports(): CapacityReport[] { return [...this.reports].sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime()); }

  getStats(): TreasuryStats {
    const resources = Array.from(this.resources.values());
    const allocations = Array.from(this.allocations.values());
    const types: ResourceType[] = ['compute', 'memory', 'storage', 'network', 'api_quota', 'agent_slot'];
    return {
      totalResources: resources.length, totalAllocations: allocations.length,
      activeAllocations: allocations.filter(a => a.status === 'active').length,
      totalCapacity: Object.fromEntries(types.map(t => [t, resources.filter(r => r.type === t).reduce((s, r) => s + r.totalCapacity, 0)])) as Record<ResourceType, number>,
      totalAllocated: Object.fromEntries(types.map(t => [t, resources.filter(r => r.type === t).reduce((s, r) => s + r.allocatedCapacity, 0)])) as Record<ResourceType, number>,
      zeroCostCompliant: resources.every(r => r.cost === 0),
    };
  }

  private seedDefaultResources(): void {
    const defaults: Omit<Resource, 'id' | 'allocatedCapacity' | 'reservedCapacity' | 'createdAt' | 'updatedAt'>[] = [
      { name: 'Agent Slots', type: 'agent_slot', totalCapacity: 24, unit: 'slots', cost: 0, tags: ['agents', 'core'] },
      { name: 'API Rate Quota', type: 'api_quota', totalCapacity: 10000, unit: 'req/min', cost: 0, tags: ['api', 'rate-limit'] },
      { name: 'Compute Capacity', type: 'compute', totalCapacity: 100, unit: 'percent', cost: 0, tags: ['compute'] },
      { name: 'Memory Pool', type: 'memory', totalCapacity: 8192, unit: 'MB', cost: 0, tags: ['memory'] },
      { name: 'Storage Quota', type: 'storage', totalCapacity: 51200, unit: 'MB', cost: 0, tags: ['storage'] },
    ];
    for (const d of defaults) this.addResource(d);
  }
}

export const resourceManager = new ResourceManager();