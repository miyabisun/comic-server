import { expect, test } from '@playwright/test';

test('5,000 comics render and accept input without long stalls', async ({ page, request }, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	expect((await request.post('/__reset?count=5000')).ok()).toBe(true);
	await page.addInitScript(() => {
		window.listPerformance = { longTasks: [], inputs: [] };
		new PerformanceObserver(list => {
			window.listPerformance.longTasks.push(...list.getEntries().map(entry => entry.duration));
		}).observe({ type: 'longtask', buffered: true });
		for (const type of ['keydown', 'pointerdown']) addEventListener(type, event => {
			const start = event.timeStamp;
			requestAnimationFrame(() => requestAnimationFrame(() => {
				window.listPerformance.inputs.push({ type, duration: performance.now() - start });
			}));
		}, { capture: true, passive: true });
	});
	const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	await page.goto('/comic/bookshelves/unread');
	await expect(page.getByRole('grid')).toHaveAttribute('aria-busy', 'false');
	await frame();
	const initial = await page.evaluate(() => ({ elapsed: performance.now(), longestTask: Math.max(0, ...window.listPerformance.longTasks) }));
	await testInfo.attach('initial-performance', { body: JSON.stringify(initial), contentType: 'application/json' });
	expect(initial.elapsed).toBeLessThan(1500);
	expect(initial.longestTask).toBeLessThan(750);
	await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '5001');
	expect(await page.locator('tbody [data-comic-id]').count()).toBeLessThan(100);
	await page.keyboard.press('j');
	await expect(page.locator('tr[aria-selected="true"]')).toHaveAttribute('data-comic-id', '2');
	await page.keyboard.press('k');
	await expect(page.locator('tr[aria-selected="true"]')).toHaveAttribute('data-comic-id', '1');
	await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
	await expect(page.locator('#comic-row-5000')).toBeInViewport();
	await expect(page.locator('#comic-row-1')).toHaveCount(1);
	await expect(page.locator('#comic-row-5000')).toHaveAttribute('aria-rowindex', '5001');
	await page.locator('#comic-row-5000 .date').click();
	await expect(page.locator('tr[aria-selected="true"]')).toHaveAttribute('data-comic-id', '5000');
	await page.keyboard.press('k');
	await expect(page.locator('tr[aria-selected="true"]')).toHaveAttribute('data-comic-id', '4999');
	await frame();
	const inputs = await page.evaluate(() => window.listPerformance.inputs);
	await testInfo.attach('input-performance', { body: JSON.stringify(inputs), contentType: 'application/json' });
	expect(inputs.filter(entry => entry.type === 'keydown')).toHaveLength(3);
	expect(inputs.some(entry => entry.type === 'pointerdown')).toBe(true);
	expect(Math.max(...inputs.map(entry => entry.duration))).toBeLessThan(150);
});

for (const url of ['/comic/bookshelves/unread', '/comic/brand/Zeta?match=exact']) {
	test(`large list preserves selection, history and action targets: ${url}`, async ({ page, request }) => {
		expect((await request.post('/__reset?count=1000')).ok()).toBe(true);
		await page.setViewportSize({ width: 1280, height: 720 });
		const grid = page.getByRole('grid');
		const selected = page.locator('tr[aria-selected="true"]');
		const ready = () => expect(grid).toHaveAttribute('aria-busy', 'false');
		const cursor = id => expect(selected).toHaveAttribute('data-comic-id', String(id));
		await page.goto(url); await ready();
		await page.evaluate(() => {
			const body = document.querySelector('tbody');
			scrollTo(0, body.getBoundingClientRect().top + scrollY + 295 * body.querySelector('[data-comic-id]').getBoundingClientRect().height);
		});
		await page.locator('#comic-row-300 .date').click(); await cursor(300);
		await grid.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', isComposing: true, bubbles: true })));
		await cursor(300);
		await page.keyboard.press('3'); await ready();
		const id = url.includes('bookshelves') ? 301 : 300;
		await cursor(id);
		expect((await (await request.get('/comic/api/comics/300')).json()).bookshelf).toBe('favorite');
		if (url.includes('bookshelves')) {
			await page.getByRole('button', { name: 'brand', exact: true }).click(); await cursor(id);
		} else {
			await page.getByRole('combobox').focus(); await page.keyboard.press('j'); await cursor(id);
		}
		await grid.evaluate(el => el.focus({ preventScroll: true }));
		await selected.scrollIntoViewIfNeeded();
		const savedY = await page.evaluate(() => scrollY);
		await page.keyboard.press('Enter'); await expect(page).toHaveURL(new RegExp(`/comics/${id}$`));
		await expect(page.locator('.page')).toHaveText('1 / 12');
		await page.goBack(); await ready(); await cursor(id);
		await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(savedY, 0);
		await expect(grid).toHaveAttribute('aria-activedescendant', `comic-row-${id}`);
		await expect(selected).toBeInViewport();
		await page.setViewportSize({ width: 375, height: 812 });
		await page.keyboard.press('j');
		await expect(selected).toBeInViewport();
		expect(await page.locator('tbody [data-comic-id]').count()).toBeLessThan(100);
		await page.keyboard.press('d'); await page.keyboard.press('d');
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
		if (url.includes('brand')) {
			await page.getByRole('button', { name: '表示中の500件をlikeに評価', exact: true }).click();
			await expect(dialog).toContainText('完全一致: Zetaの500件');
			await page.keyboard.press('y'); await expect(dialog).toBeVisible();
			await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
			await page.getByRole('button', { name: 'すべて削除', exact: true }).click();
			await expect(dialog).toContainText('完全一致: Zetaの500件');
			await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
			await page.keyboard.press('d'); await page.keyboard.press('d');
			await page.keyboard.press('y'); await expect(dialog).toHaveCount(0); await ready();
			await cursor(302);
			const heights = await page.locator('tbody [data-comic-id]').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
			expect(Math.max(...heights)).toBe(Math.min(...heights));
		}
	});
}
