import { expect, it } from 'bun:test';
import { brandPath } from './brand.js';

it('builds explicit brand links without interpreting names as URL syntax', () => {
	for (const name of ['めぐ', '本名(めぐ、別名)', '%_ /?#', ' めぐ ']) {
		for (const match of ['fuzzy', 'exact']) {
			const url = new URL(brandPath(name, match), 'https://example.test');
			expect(decodeURIComponent(url.pathname.slice('/brand/'.length))).toBe(name);
			expect(url.searchParams.get('match')).toBe(match);
		}
	}
	expect(brandPath('めぐ')).toEndWith('?match=fuzzy');
	for (const name of ['', ' ', null, undefined]) expect(brandPath(name, 'exact')).toBeNull();
});
