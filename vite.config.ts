import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5183, strictPort: true, allowedHosts: ['.dev.obayy.dev'] },
  preview: { host: true, port: 5184, strictPort: true, allowedHosts: ['.dev.obayy.dev'] },
})
