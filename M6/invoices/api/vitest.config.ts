import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        testTimeout: 30_000,
        hookTimeout: 120_000, // start kontenerów
        // Każdy plik integracyjny ma własne kontenery -> bez współdzielonego stanu
        fileParallelism: false
    }
});