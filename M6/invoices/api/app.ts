import express, { Express, Request, Response } from 'express';
import mongoose, { Connection, Model } from 'mongoose';
import { createClient, RedisClientType } from 'redis';

export interface InvoiceDoc {
    title: string;
    amount: number;
    createdAt: Date;
}

const invoiceSchema = new mongoose.Schema<InvoiceDoc>({
    title: String,
    amount: Number,
    createdAt: { type: Date, default: Date.now }
});

export interface AppHandles {
    app: Express;
    // Uchwyty potrzebne, aby testy mogły posprzątać połączenia.
    mongoConnection: Connection;
    redisClient: RedisClientType;
    close: () => Promise<void>;
}

/**
 * Buduje aplikację Express i podłącza ją do podanych instancji Mongo/Redis.
 * Kluczowe: URI przychodzą z zewnątrz (z Testcontainers w testach,
 * ze zmiennych środowiskowych na produkcji).
 *
 * Używamy mongoose.createConnection (a NIE globalnego mongoose.connect),
 * żeby dało się tworzyć izolowane połączenia per-test.
 */
export async function createApp(mongoUri: string, redisUri: string): Promise<AppHandles> {
    const mongoConnection = await mongoose.createConnection(mongoUri).asPromise();
    const Invoice: Model<InvoiceDoc> = mongoConnection.model<InvoiceDoc>('Invoice', invoiceSchema);

    const redisClient: RedisClientType = createClient({ url: redisUri });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();

    const app = express();
    app.use(express.json());

    // --- Endpointy ---

    // GET /invoices - Zwraca listę faktur z cache lub bazy danych
    app.get('/invoices', async (req: Request, res: Response) => {
        try {
            // 1. Sprawdź, czy dane są w Redis (Cache Hit)
            const cachedInvoices = await redisClient.get('invoices_list');

            if (cachedInvoices) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(JSON.parse(cachedInvoices));
            }

            // 2. Brak w Redis (Cache Miss) - pobierz z MongoDB
            const invoices = await Invoice.find().sort({ createdAt: -1 });

            // 3. Zapisz w Redis na 1 godzinę (3600 sekund)
            await redisClient.setEx('invoices_list', 3600, JSON.stringify(invoices));
            res.setHeader('X-Cache', 'MISS');

            res.json(invoices);
        } catch (error) {
            res.status(500).json({ error: 'Wystąpił błąd serwera' });
        }
    });

    // POST /invoices - Tworzy nową fakturę i czyści cache
    app.post('/invoices', async (req: Request, res: Response) => {
        try {
            const { title, amount } = req.body;

            // 1. Zapis do MongoDB
            const newInvoice = new Invoice({ title, amount });
            await newInvoice.save();

            // 2. Inwalidacja (usunięcie) cache'a w Redis, ponieważ dane uległy zmianie
            await redisClient.del('invoices_list');

            res.status(201).json(newInvoice);
        } catch (error) {
            res.status(500).json({ error: 'Wystąpił błąd podczas zapisu' });
        }
    });

    const close = async () => {
        await redisClient.quit();
        await mongoConnection.close();
    };

    return { app, mongoConnection, redisClient, close };
}