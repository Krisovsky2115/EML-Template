import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

delete process.env.ELECTRON_RUN_AS_NODE

export default defineConfig({
  base: './',
  server: {
    port: 5174
  },
  plugins: [
    electron([
      {
        entry: 'electron/main.ts'
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false
          }
        },
        onstart(options) {
          options.reload()
        }
      }
    ])
  ]
})

