export function listWindow(length, cursorIndex, offset, height, rowHeight) {
	if (length <= 100) return Array.from({ length }, (_, index) => index);
	const start = Math.min(length - 1, Math.max(0, Math.floor(offset / rowHeight) - 20));
	const end = Math.min(length, Math.max(start + 1, Math.ceil((offset + height) / rowHeight) + 20));
	const indices = Array.from({ length: end - start }, (_, index) => start + index);
	if (cursorIndex >= 0 && cursorIndex < length) {
		if (cursorIndex < start) indices.unshift(cursorIndex);
		else if (cursorIndex >= end) indices.push(cursorIndex);
	}
	return indices;
}
