import { getBasePath } from '$lib/router.svelte.js';

export default {
	path: {
		get api() { return `${getBasePath()}/api`; },
		get images() { return `${getBasePath()}/images`; }
	}
};
