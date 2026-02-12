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
