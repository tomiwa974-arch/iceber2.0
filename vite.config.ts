import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import adonisjs from '@adonisjs/vite/client'

export default defineConfig({
  // Tests and the live development server must not replace each other's
  // optimized React modules while both processes are running.
  cacheDir: process.env.NODE_ENV === 'test' ? 'node_modules/.vite-test' : 'node_modules/.vite',
  plugins: [
    react(),
    tailwindcss(),
    adonisjs({ entryPoints: ['inertia/app.tsx'], reload: ['resources/views/**/*.edge'] }),
  ],

  /**
   * Define aliases for importing modules from
   * your frontend code
   */
  resolve: {
    alias: {
      '~/': `${import.meta.dirname}/inertia/`,
      '@generated': `${import.meta.dirname}/.adonisjs/client/`,
    },
  },

  server: {
    hmr: process.env.NODE_ENV === 'test' ? { port: 24679 } : undefined,
    watch: {
      ignored: ['**/storage/**', '**/tmp/**', '**/public/uploads/**'],
    },
  },
})
