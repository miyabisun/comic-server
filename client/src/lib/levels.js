const levels = ['unread', 'hold', 'like', 'favorite', 'love', 'legend'];

export function levelGe(a, b) {
	return levels.indexOf(a) >= levels.indexOf(b);
}
