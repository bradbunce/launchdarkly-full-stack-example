import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/events': {
        target: 'http://server:5000',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for SSE
      },
      '/logs': {
        target: 'http://server:5000',
        changeOrigin: true,
        ws: true,
      },
      '/context': {
        target: 'http://server:5000',
        changeOrigin: true
      },
      '/fact': {
        target: 'http://server:5000',
        changeOrigin: true
      },
      '/api': {
        target: 'http://server:5000',
        changeOrigin: true
      }
    }
  },
  define: {
    'process.env': {}
  }
})