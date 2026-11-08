import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    publicDir: 'assets',
    server: {
        port: 5173,
        open: true,
        cors: true,
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        minify: 'esbuild',
        rollupOptions: {
            input: {
                main: 'index.html'
            }
        }
    },
    resolve: {
        alias: {
            '@': '/js'
        }
    },
    esbuild: {
        target: 'es2022'
    }
});