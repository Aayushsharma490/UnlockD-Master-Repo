import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    // host: true is required for Vite to bind to 0.0.0.0 inside Docker,
    // otherwise it only listens on 127.0.0.1 and the port isn't reachable
    // from outside the container.
    host: true,
    port: 5173,

    proxy: {
      // In Docker Compose, the backend service is reachable via its service name.
      // Locally, it's on localhost:3000 — the VITE_API_URL env var lets us switch.
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
