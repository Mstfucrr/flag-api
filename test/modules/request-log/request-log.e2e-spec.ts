import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';

const FLAGS_API_KEY = 'e2e-test-key';

describe('RequestLogController (e2e) — page pagination', () => {
    let app: INestApplication<App>;
    let resourceId: string;

    beforeAll(async () => {
        // ConfigModule bunu ilk okuduğunda değer görmesi için module derlenmeden
        // önce set edilmeli — pre-commit/CI ortamında FLAGS_API_KEY tanımlı
        // olmayabilir, test kendi değerini garanti etmeli.
        process.env.FLAGS_API_KEY = FLAGS_API_KEY;

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

        const projectKey = `reqlog-e2e-${Date.now()}`;
        resourceId = `/feature-flags/projects/${projectKey}`;
        await request(app.getHttpServer())
            .post('/admin/projects')
            .send({ name: 'Request Log E2E', key: projectKey })
            .expect(201);

        // 5 farklı flag oluşturmak, aynı projeye (== aynı resourceId'ye) 5 audit
        // request-log satırı düşürür — sayfalamayı test etmek için yeterli.
        for (let i = 0; i < 5; i++) {
            await request(app.getHttpServer())
                .post(`/admin/projects/${projectKey}/flags`)
                .set('Authorization', `Bearer ${FLAGS_API_KEY}`)
                .send({ key: `flag-${i}`, enabled: true, rules: [] })
                .expect(201);
        }
    });

    afterAll(async () => {
        await app.close();
    });

    it('pageSize=100 tüm kayıtları döner ve toplamı doğru sayar', async () => {
        const res = await request(app.getHttpServer())
            .post('/admin/request-logs/query')
            .send({ resourceId, pageSize: 100, page: 1 })
            .expect(200);
        const body = res.body as { items: unknown[]; total: number; totalPages: number };
        expect(body.total).toBe(5);
        expect(body.totalPages).toBe(1);
        expect(body.items).toHaveLength(5);
    });

    it('sayfalar birbirini tekrarlamadan, doğru sırada tüm setı oluşturur', async () => {
        const fullRes = await request(app.getHttpServer())
            .post('/admin/request-logs/query')
            .send({ resourceId, pageSize: 100, page: 1 })
            .expect(200);
        const fullIds = (fullRes.body as { items: { id: string }[] }).items.map((i) => i.id);

        const page1 = await request(app.getHttpServer())
            .post('/admin/request-logs/query')
            .send({ resourceId, pageSize: 2, page: 1 })
            .expect(200);
        const page2 = await request(app.getHttpServer())
            .post('/admin/request-logs/query')
            .send({ resourceId, pageSize: 2, page: 2 })
            .expect(200);
        const page3 = await request(app.getHttpServer())
            .post('/admin/request-logs/query')
            .send({ resourceId, pageSize: 2, page: 3 })
            .expect(200);

        const p1Body = page1.body as { items: { id: string }[]; total: number; totalPages: number };
        const p2Body = page2.body as { items: { id: string }[] };
        const p3Body = page3.body as { items: { id: string }[] };

        expect(p1Body.total).toBe(5);
        expect(p1Body.totalPages).toBe(3);
        expect(p1Body.items).toHaveLength(2);
        expect(p2Body.items).toHaveLength(2);
        expect(p3Body.items).toHaveLength(1);

        const stitched = [...p1Body.items, ...p2Body.items, ...p3Body.items].map((i) => i.id);
        expect(stitched).toEqual(fullIds);

        // Sayfalar arasında çakışma olmamalı (eski cursor bug'ında olduğu gibi
        // bir sonraki sayfanın bir öncekiyle aynı/örtüşen kayıtları dönmesi).
        expect(new Set(stitched).size).toBe(5);
    });

    it('page verilen aralığın dışındaysa boş items ama doğru total/totalPages döner', async () => {
        const res = await request(app.getHttpServer())
            .post('/admin/request-logs/query')
            .send({ resourceId, pageSize: 2, page: 10 })
            .expect(200);
        const body = res.body as { items: unknown[]; total: number; totalPages: number };
        expect(body.items).toHaveLength(0);
        expect(body.total).toBe(5);
        expect(body.totalPages).toBe(3);
    });
});
