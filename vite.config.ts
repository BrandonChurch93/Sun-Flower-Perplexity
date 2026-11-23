import { defineConfig } from 'vitest/config'
import { approvedFiles, computeHashes, versions } from './tools/lib/hashes.ts'

const hashes = computeHashes()

export default defineConfig({
  base: './',
  define: {
    __APPROVED_FILES__: JSON.stringify(approvedFiles()),
    __ENGINE_HASH__: JSON.stringify(hashes.engineHash),
    __UNIT_HASHES__: JSON.stringify(hashes.unitHashes),
    __VERSIONS__: JSON.stringify(versions()),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: '127.0.0.1' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
})
