import { createApp } from './app';

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/invoices_db';
const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';

(async () => {
    try {
        const { app } = await createApp(MONGO_URI, REDIS_URI);
        app.listen(PORT, () => {
            console.log(`🚀 Serwer działa na porcie ${PORT}`);
        });
    } catch (error) {
        console.error('Błąd startu serwera:', error);
        process.exit(1);
    }
})();