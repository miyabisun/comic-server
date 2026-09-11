import { expect, test } from '@playwright/test';

const shelf = '/comic/bookshelves/unread';
const brand = '/comic/brand/Zeta?match=exact';
const grid = page => page.getByRole('grid', { name: 'コミック一覧' });
const ready = page => expect(grid(page)).toHaveAttribute('aria-busy', 'false');
const cursor = (page, id) => expect(page.locator('tr[aria-selected="true"]')).toHaveAttribute('data-comic-id', String(id));
const focusGrid = page => grid(page).evaluate(el => el.focus({ preventScroll: true }));

test.beforeEach(async ({ request }) => { expect((await request.post('/__reset')).ok()).toBe(true); });

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]) {
	for (const colorScheme of ['dark', 'light']) {
		test(`${viewport.width} ${colorScheme}: shelf and brand devote the page to rows`, async ({ page }, testInfo) => {
			await page.setViewportSize(viewport);
			await page.emulateMedia({ colorScheme });
			for (const url of [shelf, brand]) {
				await page.goto(url); await ready(page); await cursor(page, 1);
				const measure = () => page.evaluate(() => {
					const wrapper = document.querySelector('.comics').parentElement;
					const rows = [...document.querySelectorAll('tbody tr')].map(row => row.getBoundingClientRect());
					const selected = getComputedStyle(document.querySelector('tr.focused'));
					return { top: rows[0].top, visible: rows.filter(row => row.top >= 0 && row.bottom <= Math.min(innerHeight, wrapper.getBoundingClientRect().bottom)).length,
						innerScroll: wrapper.scrollHeight - wrapper.clientHeight, width: document.documentElement.scrollWidth,
						maxHeight: getComputedStyle(wrapper).maxHeight, background: selected.backgroundColor, shadow: selected.boxShadow };
				});
				const before = await measure();
				expect((await page.locator('#bookshelf h2').boundingBox()).height).toBeLessThanOrEqual(28);
				await testInfo.attach(`${url === shelf ? 'shelf' : 'brand'}-geometry`, { body: JSON.stringify(before), contentType: 'application/json' });
				await testInfo.attach(`${url === shelf ? 'shelf' : 'brand'}-screen`, { body: await page.screenshot(), contentType: 'image/png' });
				expect(before.top).toBeLessThanOrEqual(url === brand && viewport.width < 680 ? 190 : 160);
				expect(before.visible).toBeGreaterThanOrEqual(viewport.height === 720 ? 15 : 18);
				expect(before.innerScroll).toBe(0);
				expect(before.maxHeight).toBe('none');
				expect(before.width).toBe(viewport.width);
				expect(before.shadow).toBe('none');
				const hovered = page.locator('tbody tr').nth(4);
				await hovered.hover();
				expect(await hovered.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(before.background);
				await page.locator('tr.focused').hover();
				expect((await measure()).background).toBe(before.background);
				const channels = before.background.match(/[\d.]+/g).slice(0, 3).map(Number);
				expect(Math.max(...channels) - Math.min(...channels)).toBe(0);
				await page.keyboard.press('Tab');
				expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
				await page.keyboard.press('j'); await cursor(page, 2);
				expect((await measure()).top).toBe(before.top);
				await expect(page.locator('#cursor-status')).toContainText('長い作品名');
				await expect(grid(page)).toHaveAccessibleDescription(/操作対象: 長い作品名/);
				expect(await page.locator('#cursor-status').evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
				await page.mouse.move(viewport.width / 2, viewport.height / 2);
				await page.mouse.wheel(0, 600);
				await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
				expect((await page.locator('thead').boundingBox()).y).toBeLessThan(0);
				await expect(page.locator('thead')).toHaveCSS('position', 'static');
				expect((await measure()).innerScroll).toBe(0);
				if (viewport.width < 680) {
					await focusGrid(page); await page.keyboard.press('ArrowRight');
					await expect.poll(() => grid(page).evaluate(el => el.parentElement.scrollLeft)).toBeGreaterThan(0);
				}
			}
		});
	}
}

for (const url of [shelf, brand]) test(`page position, cursor and sort survive reader, delayed back, reload and legacy history: ${url}`, async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	const details = [];
	page.on('request', r => { if (r.method() === 'GET' && /\/api\/comics\/\d+$/.test(r.url())) details.push(r.url()); });
	await page.goto(url); await ready(page);
	for (let i = 0; i < 40; i++) await page.keyboard.press('j');
	await cursor(page, 41);
	await page.keyboard.press('k'); await cursor(page, 40);
	await page.keyboard.press('j'); await cursor(page, 41);
	expect(details).toHaveLength(0);
	await expect.poll(() => page.evaluate(() => history.state.comicCursor.scrollY)).toBeGreaterThan(0);
	if (url === shelf) await page.getByRole('button', { name: 'brand', exact: true }).click();
	await cursor(page, 41); await focusGrid(page);
	const saved = await page.evaluate(() => ({ y: scrollY, ...history.state.comicCursor }));
	expect(saved.sortKey).toBe(url === shelf ? 'brand' : null);
	if (url === shelf) await page.keyboard.press('Space');
	else await page.locator('tr.focused .title a').click();
	await expect(page).toHaveURL(/\/comics\/41$/);
	expect(await page.evaluate(() => history.scrollRestoration)).toBe('auto');
	await expect(page.locator('.page')).toHaveText('1 / 12');
	await expect.poll(() => page.locator('.images img').first().evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
	await page.keyboard.press('j'); await expect(page.locator('.page')).toHaveText('11 / 12');
	await page.keyboard.press('k'); await expect(page.locator('.page')).toHaveText('1 / 12');
	let resume;
	const listAPI = url === shelf ? /\/api\/bookshelves\/unread$/ : /\/api\/brands\/Zeta\?match=exact$/;
	await page.route(listAPI, async route => { await new Promise(resolve => { resume = resolve; }); await route.continue(); });
	await page.goBack(); await expect(page.locator('#bookshelf').getByRole('status')).toHaveText('loading...');
	await expect.poll(() => typeof resume).toBe('function'); resume();
	await ready(page); await cursor(page, 41);
	await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(saved.y, 0);
	await page.unroute(listAPI);
	await page.reload(); await ready(page); await cursor(page, 41);
	expect(await page.evaluate(() => scrollY)).toBeCloseTo(saved.y, 0);
	expect(await page.evaluate(() => history.scrollRestoration)).toBe('manual');
	await page.addInitScript(endpoint => history.replaceState({ comicCursor: { url: endpoint, id: 41, index: 40, sortKey: null, scrollTop: 900 } }, ''), saved.url);
	await page.reload(); await ready(page); await cursor(page, 41);
	await expect(page.locator('tr.focused')).toBeInViewport();
	expect(await page.evaluate(() => history.state.comicCursor.scrollY)).toBeGreaterThan(0);
	expect(await page.evaluate(() => history.state.comicCursor.scrollTop)).toBeUndefined();
});

test('single classification, failed update, delete and bulk confirmations keep their targets', async ({ page, request }) => {
	await page.goto(shelf); await ready(page);
	for (let i = 0; i < 30; i++) await page.keyboard.press('j');
	await cursor(page, 31); await page.keyboard.press('3'); await ready(page); await cursor(page, 32);
	expect((await (await request.get('/comic/api/comics/31')).json()).bookshelf).toBe('favorite');
	await page.route('**/api/comics/32', route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: '{}' }) : route.continue());
	await page.keyboard.press('3'); await expect(page.getByRole('alert')).toBeVisible(); await cursor(page, 32);
	await page.unroute('**/api/comics/32');
	await page.keyboard.press('d'); await page.keyboard.press('d');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('作品 032');
	await expect(dialog.getByRole('button', { name: 'キャンセル (N)' })).toBeFocused();
	await page.keyboard.press('Enter'); await expect(dialog).toHaveCount(0);
	await page.keyboard.press('d'); await page.keyboard.press('d'); await page.keyboard.press('y');
	await expect(dialog).toHaveCount(0); await ready(page); await cursor(page, 33);
	expect((await (await request.get('/comic/api/comics/32')).json()).deleted_at).not.toBeNull();
	await page.goto(brand); await ready(page);
	const ids = await grid(page).locator('tbody tr:not(.deleted)').evaluateAll(rows => rows.map(row => Number(row.dataset.comicId)));
	await page.getByRole('button', { name: `表示中の${ids.length}件をlikeに評価`, exact: true }).click();
	await expect(dialog).toContainText(`完全一致: Zetaの${ids.length}件`);
	await page.keyboard.press('y'); await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: '一括評価を確定', exact: true }).click();
	await expect(dialog).toHaveCount(0); await ready(page);
	const all = await (await request.get('/comic/api/comics')).json();
	expect(all.filter(comic => comic.bookshelf === 'like').map(comic => comic.id).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
	await page.getByRole('button', { name: 'すべて削除', exact: true }).click();
	await page.keyboard.press('y'); await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
	await page.keyboard.press('?'); await expect(dialog).toContainText('j / k');
	await page.keyboard.press('?'); await expect(dialog).toHaveCount(0);
});

test('loading, failure and empty state can recover without an extra normal band', async ({ page }) => {
	let resume;
	await page.route('**/api/bookshelves/unread', async route => { await new Promise(resolve => { resume = resolve; }); await route.fulfill({ status: 500, body: '{}' }); });
	await page.goto(shelf); await expect(page.locator('#bookshelf').getByRole('status')).toHaveText('loading...');
	await expect.poll(() => typeof resume).toBe('function'); resume();
	await expect(page.getByRole('alert')).toBeVisible();
	await page.unroute('**/api/bookshelves/unread');
	await page.getByRole('button', { name: '一覧を再取得' }).click(); await ready(page);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await page.goto('/comic/bookshelves/hold'); await ready(page);
	await expect(page.getByText('作品はありません。')).toBeVisible();
	await expect(grid(page)).not.toHaveAttribute('aria-activedescendant');
});
