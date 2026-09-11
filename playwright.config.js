import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.pw.js',
	workers: 1,
	use: { baseURL: 'http://127.0.0.1:5190', browserName: 'chromium' },
	webServer: {
		command: 'bun run build:client && bun e2e/server.ts',
		url: 'http://127.0.0.1:5190/__ready',
	},
});
