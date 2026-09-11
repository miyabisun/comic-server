import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Always isolate actual API writes and image moves from any configured library.
const directory = mkdtempSync(path.join(tmpdir(), 'comic-browser-'));
process.env.COMIC_PATH = directory;
process.env.DATABASE_PATH = path.join(directory, 'comic.db');
process.env.REMASTER_BIN = path.join(directory, 'not-installed');
process.env.REMASTER_MODEL_DIR = path.join(directory, 'models');
const { init } = await import('../src/lib/init.js');
const { db } = await import('../src/db/index.js');
const { comics } = await import('../src/db/schema.js');
const { createApp } = await import('../src/app.js');
init();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv3sAAAAASUVORK5CYII=', 'base64');
function reset() {
	db.delete(comics).run();
	for (const shelf of ['unread', 'hold', 'like', 'favorite', 'love', 'legend', 'deleted']) {
		rmSync(path.join(directory, shelf), { recursive: true, force: true });
		mkdirSync(path.join(directory, shelf));
	}
	for (let id = 1; id <= 100; id++) {
		const file = `comic-${id}`;
		db.insert(comics).values({ id, file, title: id === 2 ? '長い作品名'.repeat(30) : `作品 ${String(id).padStart(3, '0')}`,
			brand: id <= 50 ? 'Zeta' : 'Alpha', bookshelf: 'unread', created_at: new Date(Date.UTC(2026, 8, 11, 0, 0, 100 - id)).toISOString() }).run();
		const images = path.join(directory, 'unread', file);
		mkdirSync(images);
		for (let page = 1; page <= 12; page++) writeFileSync(path.join(images, `${page}.png`), png);
	}
}
reset();
const app = createApp('/comic');
app.get('/__ready', c => c.text('ok'));
app.post('/__reset', c => { reset(); return c.text('ok'); });
const server = Bun.serve({ hostname: '127.0.0.1', port: 5190, fetch: app.fetch });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
	server.stop(true);
	rmSync(directory, { recursive: true, force: true });
	process.exit(0);
});
