import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { RedisService } from '../../infrastructure/redis/redis.service';
import { HealthController } from './health.controller';

describe('HealthController readiness', () => {
  const createController = () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const redis = {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    const controller = new HealthController(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
    return { controller, prisma, redis };
  };

  it('reports ready only after PostgreSQL and Redis respond', async () => {
    const { controller, prisma, redis } = createController();

    await expect(controller.readiness()).resolves.toMatchObject({
      status: 'ready',
      checks: { database: 'up', redis: 'up' },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a required dependency is unavailable', async () => {
    const { controller, prisma } = createController();
    prisma.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
