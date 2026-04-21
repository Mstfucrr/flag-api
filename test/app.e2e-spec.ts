import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('feature-flag-api (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string; timestamp: string };
        expect(body.status).toBe('ok');
        expect(body.timestamp).toBeDefined();
      });
  });

  it('/projects (GET) returns array', async () => {
    const res = await request(app.getHttpServer()).get('/projects').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('/projects (POST) rejects invalid key', async () => {
    await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'Bad', key: 'Invalid_Key' })
      .expect(400);
  });

  it('/projects (POST) returns 409 on duplicate key', async () => {
    const key = `dup-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'First', key })
      .expect(201);
    await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'Second', key })
      .expect(409);
  });

  it('/projects (POST) creates then GET lists it', async () => {
    const key = `e2e-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/projects')
      .send({
        name: 'E2E project',
        key,
      })
      .expect(201);
    const createdBody = created.body as { key: string };
    expect(createdBody.key).toBe(key);

    const list = await request(app.getHttpServer())
      .get('/projects')
      .expect(200);
    const listBody = list.body as { key: string }[];
    const keys = listBody.map((p) => p.key);
    expect(keys).toContain(key);
  });

  afterEach(async () => {
    await app.close();
  });
});
