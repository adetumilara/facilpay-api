import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { ApiOkResponse, ApiOperation, ApiTags, ApiServiceUnavailableResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('v1/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) { }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Returns 200 if the process is up. Performs no database or outbound network calls. Use this for orchestrator liveness/restart checks — it will not fail due to a degraded external dependency. For dependency health, use the readiness probe (GET /v1/health or /v1/health/ready).',
  })
  @ApiOkResponse({
    description: 'Process is alive.',
    schema: {
      example: {
        status: 'ok',
        statusCode: 200,
        timestamp: '2026-01-26T10:00:00.000Z',
        uptime: 3600,
      },
    },
  })
  liveness() {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Returns API readiness including database, Stellar network, and system metrics. Returns 503 if any critical dependency is unreachable. Use this for orchestrator readiness checks, not liveness/restart decisions — for that, use GET /v1/health/live. Equivalent to GET /v1/health.',
  })
  @ApiOkResponse({
    description: 'Readiness status (ok or degraded).',
    schema: {
      example: {
        status: 'ok',
        statusCode: 200,
        timestamp: '2026-01-26T10:00:00.000Z',
        uptime: 3600,
        services: {
          database: {
            status: 'healthy',
            message: 'Database connection is healthy',
          },
          stellar: {
            status: 'healthy',
            message: 'Stellar network is reachable',
          },
          horizonStream: {
            status: 'connected',
            message: 'Horizon SSE stream is active',
          },
          system: {
            memory: {
              used: 536870912,
              total: 8589934592,
              percentUsed: 6.25,
            },
            uptime: 3600,
          },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Service unavailable - critical dependency is unhealthy.',
  })
  async ready(): Promise<any> {
    return this.health();
  }

  @Get()
  @ApiOperation({
    summary: 'Health check (readiness)',
    description:
      'Returns API health status including database, Stellar network, and system metrics. Returns 503 if any critical subsystem is unhealthy. This is a readiness check — for a liveness probe that performs no outbound calls, use GET /v1/health/live.',
  })
  @ApiOkResponse({
    description: 'Health status (ok or degraded).',
    schema: {
      example: {
        status: 'ok',
        statusCode: 200,
        timestamp: '2026-01-26T10:00:00.000Z',
        uptime: 3600,
        services: {
          database: {
            status: 'healthy',
            message: 'Database connection is healthy',
          },
          stellar: {
            status: 'healthy',
            message: 'Stellar network is reachable',
          },
          horizonStream: {
            status: 'connected',
            message: 'Horizon SSE stream is active',
          },
          queue: {
            status: 'healthy',
            message: 'Redis connection is healthy',
          },
          system: {
            memory: {
              used: 536870912,
              total: 8589934592,
              percentUsed: 6.25,
            },
            uptime: 3600,
          },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Service unavailable - critical subsystem is unhealthy.',
    schema: {
      example: {
        status: 'unhealthy',
        statusCode: 503,
        timestamp: '2026-01-26T10:00:00.000Z',
        uptime: 3600,
        services: {
          database: {
            status: 'healthy',
            message: 'Database connection is healthy',
          },
          stellar: {
            status: 'healthy',
            message: 'Stellar network is reachable',
          },
          horizonStream: {
            status: 'disconnected',
            message: 'Horizon SSE stream is not connected',
          },
          queue: {
            status: 'unhealthy',
            message: 'connect ECONNREFUSED 127.0.0.1:6379',
          },
          system: {
            memory: {
              used: 536870912,
              total: 8589934592,
              percentUsed: 6.25,
            },
            uptime: 3600,
          },
        },
      },
    },
  })
  async health(): Promise<any> {
    const result = await this.healthService.check();
    if (result.statusCode === 503) {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
