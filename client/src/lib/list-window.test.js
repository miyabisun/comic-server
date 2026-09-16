import { expect, test } from 'bun:test';
import { listWindow } from './list-window.js';

const range = (start, end) => Array.from({ length: end - start }, (_, index) => start + index);

test('small and empty lists retain their complete rows', () => {
	expect(listWindow(0, -1, 0, 900, 32)).toEqual([]);
	expect(listWindow(100, 40, 500, 900, 32)).toEqual(range(0, 100));
});

test('large lists render the viewport with twenty rows on either side', () => {
	expect(listWindow(5000, 0, 0, 320, 32)).toEqual(range(0, 30));
	expect(listWindow(5000, 100, 3200, 320, 32)).toEqual(range(80, 130));
	expect(listWindow(5000, 100, 4000, 400, 40)).toEqual(range(80, 130));
});

test('the selected row remains in the DOM even outside the viewport', () => {
	expect(listWindow(5000, 0, 3200, 320, 32)).toEqual([0, ...range(80, 130)]);
	expect(listWindow(5000, 4999, 3200, 320, 32)).toEqual([...range(80, 130), 4999]);
});

test('window bounds stay valid above and below the list', () => {
	expect(listWindow(5000, -1, -1000, 320, 32)).toEqual([0]);
	expect(listWindow(5000, 4999, 160000, 320, 32)).toEqual(range(4980, 5000));
	expect(listWindow(5000, 5000, 1e9, 320, 32)).toEqual([4999]);
});
