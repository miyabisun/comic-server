import { expect, it } from 'bun:test';
import { commandKey, createDeleteSequence, reconcileCursor, ratingForKey, readerMove } from './keyboard.js';

it('preserves an ID or picks its following position, falling back at the end', () => {
	const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
	expect(reconcileCursor(rows, null)).toBe(1);
	expect(reconcileCursor([rows[2], rows[0], rows[1]], 2, 0)).toBe(2);
	expect(reconcileCursor([rows[0], rows[2]], 2, 1)).toBe(3);
	expect(reconcileCursor(rows.slice(0, 2), 3, 2)).toBe(2);
	expect(reconcileCursor([], 2, 1)).toBeNull();
});

it('accepts only independent double d within 500ms on the same target', () => {
	const sequence = createDeleteSequence();
	expect(sequence.press('d', 1, false, 0)).toBe(false);
	expect(sequence.press('d', 1, false, 500)).toBe(true);
	expect(sequence.press('d', 1, false, 1000)).toBe(false);
	expect(sequence.press('d', 1, false, 1501)).toBe(false);
	sequence.reset();
	expect(sequence.press('d', 1, false, 2000)).toBe(false);
	expect(sequence.press('d', 1, true, 2100)).toBe(false);
	expect(sequence.press('d', 1, false, 2200)).toBe(false);
	expect(sequence.press('k', 1, false, 2250)).toBe(false);
	expect(sequence.press('d', 1, false, 2300)).toBe(false);
	expect(sequence.press('d', 2, false, 2400)).toBe(false);
	sequence.reset();
	expect(sequence.press('d', 2, false, 2450)).toBe(false);
	expect(sequence.press(null, 2, false, 2460)).toBe(false);
	expect(sequence.press('d', 2, false, 2470)).toBe(false);
	expect(sequence.press('d', null, false, 2480)).toBe(false);
});

it('blocks modified and composing commands and keeps explicit rating/page mappings', () => {
	for (const blocked of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }, { target: { isContentEditable: true } }]) {
		expect(commandKey({ key: 'd', ...blocked })).toBeNull();
	}
	expect(commandKey({ key: '?', shiftKey: true })).toBe('?');
	expect(['1','2','3','4','5'].map(ratingForKey)).toEqual(['hold','like','favorite','love','legend']);
	for (const key of ['0','6','11','', 'j']) expect(ratingForKey(key)).toBeNull();
	for (const [letter, arrow, delta] of [['h','ArrowLeft',-1],['l','ArrowRight',1],['k','ArrowUp',-10],['j','ArrowDown',10]]) {
		expect(readerMove(letter)).toBe(delta);
		expect(readerMove(arrow)).toBe(delta);
	}
	expect(readerMove('i')).toBeNull();
});
