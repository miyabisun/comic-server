import config from '$lib/config.js';

export async function updateComic(id, data) {
	const r = await fetch(`${config.path.api}/comics/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
	return r.json();
}

export async function deleteComic(id) {
	const r = await fetch(`${config.path.api}/comics/${id}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' }
	});
	if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
	return r.json();
}

async function comicPost(id, action) {
	const r = await fetch(`${config.path.api}/comics/${id}/${action}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});
	const data = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
	return data;
}

export const startUpscale = (id) => comicPost(id, 'upscale');
export const confirmUpscale = (id) => comicPost(id, 'upscale/confirm');
export const rollbackUpscale = (id) => comicPost(id, 'upscale/rollback');

async function jobStatus(id, action) {
	const r = await fetch(`${config.path.api}/comics/${id}/${action}/status`);
	if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
	return r.json();
}

export const getUpscaleStatus = (id) => jobStatus(id, 'upscale');
export const getRemasterStatus = (id) => jobStatus(id, 'remaster');
export const startRemaster = (id) => comicPost(id, 'remaster');
export const cancelRemaster = (id) => comicPost(id, 'remaster/cancel');
