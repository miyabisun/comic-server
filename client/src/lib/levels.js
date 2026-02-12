const levels = ['unread', 'trash', 'hold', 'like', 'favorite', 'legend'];

export function levelGe(a, b) {
	return levels.indexOf(a) >= levels.indexOf(b);
}
