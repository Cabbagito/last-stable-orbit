import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In docker compose the API runs as the `api` service; on a plain machine it's localhost:8000.
const api = process.env.VITE_API ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets-web' }, // /assets is the game art, served by the API
  server: {
    host: true,
    port: 5173,
    // changeOrigin stays false so the API sees Host = this page's host and accepts the socket's Origin
    proxy: {
      '/api': { target: api },
      '/assets': { target: api },
      '/healthz': { target: api },
      '/ws': { target: api, ws: true },
    },
  },
})
