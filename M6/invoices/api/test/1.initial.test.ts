import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoDBContainer, StartedMongoDBContainer } from '@testcontainers/mongodb';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { createClient, RedisClientType } from 'redis';
import { createApp, AppHandles } from '../app';

let mongoContainer: StartedMongoDBContainer;
let redisContainer: StartedRedisContainer;
let handles: AppHandles;
// Osobny klient Redis tylko do inspekcji cache w asercjach (niezależny od aplikacji).
let inspectorRedis: RedisClientType;

beforeAll(async () => {
    // 1. Start obu kontenerów równolegle (oszczędza czas).
    [mongoContainer, redisContainer] = await Promise.all([
        new MongoDBContainer('mongo:7').start(),
        new RedisContainer('redis:7-alpine').start()
    ]);

    // Kontener Mongo z Testcontainers startuje jako replica set,
    // więc string połączenia wymaga directConnection=true.
    const mongoUri = `${mongoContainer.getConnectionString()}?directConnection=true`;
    const redisUri = redisContainer.getConnectionUrl();

    // 2. Zbuduj aplikację podpiętą do prawdziwych kontenerów.
    handles = await createApp(mongoUri, redisUri);

    inspectorRedis = createClient({ url: redisUri });
    await inspectorRedis.connect();
}, 120_000); // pierwszy pull obrazów może chwilę potrwać

afterEach(async () => {
    // Izolacja między testami: czyścimy kolekcję i cache.
    await handles.mongoConnection.collection('invoices').deleteMany({});
    await inspectorRedis.flushAll();
});

afterAll(async () => {
    await inspectorRedis?.quit();
    await handles?.close();
    await Promise.all([mongoContainer?.stop(), redisContainer?.stop()]);
});

describe('HTTP ↔ Express ↔ MongoDB ↔ Redis', () => {
    it('POST tworzy fakturę w MongoDB i zwraca 201', async () => {
        const res = await request(handles.app)
            .post('/invoices')
            .send({ title: 'Faktura 1', amount: 100 })
            .expect(201);

        expect(res.body.title).toBe('Faktura 1');
        expect(res.body.amount).toBe(100);
        expect(res.body._id).toBeDefined();
    });

    it('pierwszy GET to cache MISS (czyta z Mongo i zapisuje do Redis)', async () => {
        await request(handles.app).post('/invoices').send({ title: 'F1', amount: 10 });

        const res = await request(handles.app).get('/invoices').expect(200);

        expect(res.headers['x-cache']).toBe('MISS');
        expect(res.body).toHaveLength(1);

        // Asercja "nie do udowodnienia mockiem": dane FAKTYCZNIE wylądowały w Redis.
        const cached = await inspectorRedis.get('invoices_list');
        expect(cached).not.toBeNull();
        expect(JSON.parse(cached!)).toHaveLength(1);
    });

    it('drugi GET to cache HIT (serwowane z Redis, nie z Mongo)', async () => {
        await request(handles.app).post('/invoices').send({ title: 'F1', amount: 10 });

        await request(handles.app).get('/invoices').expect(200); // MISS – wypełnia cache

        // Podmieniamy zawartość cache, by udowodnić, że drugi GET czyta z Redis,
        // a NIE z Mongo (gdyby czytał z Mongo, dostalibyśmy oryginalne dane).
        await inspectorRedis.set('invoices_list', JSON.stringify([{ title: 'Z_CACHE', amount: 999 }]));

        const res = await request(handles.app).get('/invoices').expect(200);
        expect(res.headers['x-cache']).toBe('HIT');
        expect(res.body[0].title).toBe('Z_CACHE');
    });

    it('POST inwaliduje (usuwa) cache w Redis', async () => {
        await request(handles.app).post('/invoices').send({ title: 'F1', amount: 10 });
        await request(handles.app).get('/invoices'); // wypełnia cache
        expect(await inspectorRedis.get('invoices_list')).not.toBeNull();

        await request(handles.app).post('/invoices').send({ title: 'F2', amount: 20 });

        // Po zapisie cache musi zniknąć.
        expect(await inspectorRedis.get('invoices_list')).toBeNull();
    });

    it('pełny cykl spójności: POST → GET pokazuje świeże dane', async () => {
        await request(handles.app).post('/invoices').send({ title: 'A', amount: 1 });
        let res = await request(handles.app).get('/invoices').expect(200);
        expect(res.body).toHaveLength(1);

        await request(handles.app).post('/invoices').send({ title: 'B', amount: 2 });
        res = await request(handles.app).get('/invoices').expect(200);
        // Gdyby inwalidacja cache nie działała, dostalibyśmy stary, 1-elementowy wynik.
        expect(res.body).toHaveLength(2);
    });
});