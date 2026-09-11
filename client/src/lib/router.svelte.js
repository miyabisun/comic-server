export function getBasePath() {
	return (window.__BASE_PATH__ || '').replace(/\/+$/, '');
}

export function link(path) {
	return `${getBasePath()}${path}`;
}

let _routeIndex = $state(0);
let _params = $state({});

export const routes = [
	{ pattern: /^\/$/, params: [] },
	{ pattern: /^\/bookshelves\/([^/]+)$/, params: ['name'] },
	{ pattern: /^\/brand\/([^/]+)$/, params: ['name'] },
	{ pattern: /^\/comics\/([^/]+)$/, params: ['id'] },
];

export function matchRoute(path) {
	for (let i = 0; i < routes.length; i++) {
		const match = path.match(routes[i].pattern);
		if (match) {
			const params = {};
			routes[i].params.forEach((key, j) => {
				params[key] = decodeURIComponent(match[j + 1]);
			});
			return { index: i, params };
		}
	}
	return { index: 0, params: {} };
}

function getPathFromURL() {
	const base = getBasePath();
	let path = window.location.pathname;
	if (base && path.startsWith(base)) {
		path = path.slice(base.length) || '/';
	}
	return path;
}

function syncRoute() {
	const result = matchRoute(getPathFromURL());
	// Lists restore only after their asynchronous rows are rendered.
	history.scrollRestoration = result.index === 1 || result.index === 2 ? 'manual' : 'auto';
	if (result.index === 2) result.params.match = new URLSearchParams(window.location.search).get('match') ?? 'fuzzy';
	_routeIndex = result.index;
	_params = result.params;
}

export function navigate(path) {
	history.pushState({}, '', getBasePath() + path);
	syncRoute();
}

window.addEventListener('popstate', syncRoute);

// Initialize on load
syncRoute();

export const router = {
	get index() { return _routeIndex; },
	get params() { return _params; },
};
