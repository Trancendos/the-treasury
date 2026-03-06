## Wave 3 — The Treasury: Resource Manager Platform Module

Implements The Treasury as a standalone service — resource management, allocation tracking, and capacity reporting for the Trancendos mesh. All resources operate at zero cost.

### What's Included

**ResourceManager** (`src/resources/resource-manager.ts`)
- Resource CRUD supporting 6 types: compute, memory, storage, network, api_quota, agent_slot
- `allocate(params)` — checks capacity, creates ResourceAllocation with tracking
- `release(allocationId)` — returns capacity back to resource pool
- `generateCapacityReport()` — utilization analysis with recommendations
- All resources have cost=0 (zero-cost mandate enforced at the data layer)

**5 Seed Resources**
| Resource | Capacity | Type |
|----------|----------|------|
| Agent Slots | 24 slots | agent_slot |
| API Rate Quota | 10,000 req/min | api_quota |
| Compute | 100% | compute |
| Memory | 8,192 MB | memory |
| Storage | 51,200 MB | storage |

**REST API** (`src/api/server.ts`)
- CRUD `/resources` — resource management
- POST `/allocations` — create allocation
- DELETE `/allocations/:id` — release allocation
- GET `/allocations` — list active allocations
- GET `/reports/capacity` — capacity utilization report
- GET `/stats`, `/health`, `/metrics`

**Bootstrap** (`src/index.ts`)
- Port 3015
- Pino structured logging
- Graceful shutdown (SIGTERM/SIGINT)

### Architecture
- Zero-cost mandate compliant (all resource costs = $0)
- Strict TypeScript ES2022
- Express + Helmet + CORS + Morgan
- Pino structured logging

### Part of Wave 3 — Platform Modules
Trancendos Industry 6.0 / 2060 Standard