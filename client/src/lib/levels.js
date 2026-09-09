const levels = ['unread', 'hold', 'like', 'favorite', 'love', 'legend'];
export const ratingLevels = levels.slice(1);

export function levelGe(a, b) {
	return levels.indexOf(a) >= levels.indexOf(b);
}
