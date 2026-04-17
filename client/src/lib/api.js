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

async function upscalePost(id, action = '') {
	const suffix = action ? `/${action}` : '';
	const r = await fetch(`${config.path.api}/comics/${id}/upscale${suffix}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});
	const data = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
	return data;
}

export const startUpscale = (id) => upscalePost(id);
export const confirmUpscale = (id) => upscalePost(id, 'confirm');
export const rollbackUpscale = (id) => upscalePost(id, 'rollback');

export async function getUpscaleStatus(id) {
	const r = await fetch(`${config.path.api}/comics/${id}/upscale/status`);
	if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
	return r.json();
}
