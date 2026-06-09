import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { createClient } from 'redis';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/invoices_db';
const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';

// --- Konfiguracja Redis ---
const redisClient = createClient({ url: REDIS_URI });
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// --- Konfiguracja MongoDB ---
const invoiceSchema = new mongoose.Schema({
    title: String,
    amount: Number,
    createdAt: { type: Date, default: Date.now }
});
const Invoice = mongoose.model('Invoice', invoiceSchema);

// --- Endpointy ---

// GET /invoices - Zwraca listę faktur z cache lub bazy danych
app.get('/invoices', async (req: Request, res: Response) => {
    try {
        // 1. Sprawdź, czy dane są w Redis (Cache Hit)
        const cachedInvoices = await redisClient.get('invoices_list');

        if (cachedInvoices) {
            console.log('Zwracam z cache Redis');
            return res.json(JSON.parse(cachedInvoices));
        }

        // 2. Brak w Redis (Cache Miss) - pobierz z MongoDB
        console.log('Pobieram z MongoDB');
        const invoices = await Invoice.find().sort({ createdAt: -1 });

        // 3. Zapisz w Redis na 1 godzinę (3600 sekund)
        await redisClient.setEx('invoices_list', 3600, JSON.stringify(invoices));

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
        console.log('Cache wyczyszczony');

        res.status(201).json(newInvoice);
    } catch (error) {
        res.status(500).json({ error: 'Wystąpił błąd podczas zapisu' });
    }
});

// --- Inicjalizacja ---
const startServer = async () => {
    try {
        await redisClient.connect();
        console.log('✅ Połączono z Redis');

        await mongoose.connect(MONGO_URI);
        console.log('✅ Połączono z MongoDB');

        app.listen(PORT, () => {
            console.log(`🚀 Serwer działa na porcie ${PORT}`);
        });
    } catch (error) {
        console.error('Błąd startu serwera:', error);
        process.exit(1);
    }
};

startServer();