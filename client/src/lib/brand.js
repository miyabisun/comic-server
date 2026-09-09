export function brandPath(name, match = 'fuzzy') {
	return name?.trim() ? `/brand/${encodeURIComponent(name)}?match=${match}` : null;
}
