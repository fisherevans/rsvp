import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    // Output the prod bundle into internal/spa/dist so the Go embed can pick
    // it up directly. go:embed paths must be descendants of the source file
    // referencing them, and internal/spa is where the embedding lives.
    build: {
        outDir: '../internal/spa/dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:8088',
                changeOrigin: false,
            },
            '/uploads': {
                target: 'http://localhost:8088',
                changeOrigin: false,
            },
        },
    },
})
