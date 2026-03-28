import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy /api/* a vercel dev (puerto 3000) cuando se usa npm run dev
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
