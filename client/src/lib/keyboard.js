import { ratingLevels } from './levels.js';

export function commandKey(event) {
	if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey) return null;
	if (event.target?.isContentEditable || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
	return event.key;
}

export function reconcileCursor(rows, id, index = 0) {
	return rows.some((row) => row.id === id) ? id : rows[Math.max(0, Math.min(index, rows.length - 1))]?.id ?? null;
}

export function createDeleteSequence() {
	let first = null;
	return {
		reset() { first = null; },
		press(key, id, repeat = false, now = performance.now()) {
			const previous = first;
			first = null;
			if (key !== 'd' || id == null || repeat) return false;
			if (previous?.id === id && now >= previous.time && now - previous.time <= 500) return true;
			first = { id, time: now };
			return false;
		}
	};
}

export function ratingForKey(key) {
	return /^[1-5]$/.test(key ?? '') ? ratingLevels[Number(key) - 1] : null;
}

export function readerMove(key) {
	return ({ h: -1, ArrowLeft: -1, l: 1, ArrowRight: 1, k: -10, ArrowUp: -10, j: 10, ArrowDown: 10 })[key] ?? null;
}
