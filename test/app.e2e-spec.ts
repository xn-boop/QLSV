import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';

describe('application foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns the standard success envelope and a request ID', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ok',
        service: 'qlsv-backend',
        timestamp: expect.any(String),
      },
      meta: { requestId: response.headers['x-request-id'] },
    });
  });

  it('preserves a valid caller request ID', async () => {
    const requestId = '123e4567-e89b-42d3-a456-426614174000';
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', requestId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body.meta.requestId).toBe(requestId);
  });

  it('replaces an invalid caller request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', 'untrusted-value')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('untrusted-value');
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
  });

  it('returns the standard error envelope without implementation details', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/missing').expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Cannot GET /api/v1/missing',
      },
      meta: { requestId: response.headers['x-request-id'] },
    });
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });

  it('publishes the OpenAPI document', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
    expect(response.body.info.title).toBe('QLSV Backend API');
    expect(response.body.paths).toHaveProperty('/api/v1/health/live');
  });
});
