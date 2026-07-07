import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src/test/e2e',
  timeout: 60000,
  use: {
    baseURL: 'https://smart-lab-vert.vercel.app/',
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  reporter: [['list']]
})
