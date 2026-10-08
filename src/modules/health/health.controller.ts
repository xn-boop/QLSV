import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

export interface LivenessResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'ready';
  checks: { database: 'up'; redis: 'up' };
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Check whether the API process is alive' })
  @ApiOkResponse({ description: 'The API process is alive.' })
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      service: 'qlsv-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check required backend dependencies' })
  @ApiOkResponse({ description: 'PostgreSQL and Redis are reachable.' })
  async readiness(): Promise<ReadinessResponse> {
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.pingRedis()]);
    } catch {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Required backend dependency is unavailable',
      });
    }

    return {
      status: 'ready',
      checks: { database: 'up', redis: 'up' },
      timestamp: new Date().toISOString(),
    };
  }

  private async pingRedis(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
    const response = await this.redis.ping();
    if (response !== 'PONG') throw new Error('Unexpected Redis PING response');
  }
}
