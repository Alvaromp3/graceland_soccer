import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts')) return 'charts-vendor'
          if (id.includes('react-markdown')) return 'markdown-vendor'
          if (id.includes('@tanstack/react-query')) return 'query-vendor'
          if (id.includes('/node_modules/react-router-dom/') || id.includes('/node_modules/react-router/')) return 'router-vendor'
          if (id.includes('/node_modules/lucide-react/')) return 'icons-vendor'
          if (id.includes('/node_modules/axios/')) return 'http-vendor'
          return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
