const keys = ['file', 'genre', 'brand', 'title', 'original'];

function zipObj(ks, vs) {
	const result = {};
	ks.forEach((k, i) => {
		result[k] = vs[i] || '';
	});
	return result;
}

export default function parse(name) {
	const base = zipObj(keys, keys.map(() => ''));

	const patterns = [
		{ reg: /^\(([^)]+)\)\s*\[([^\]]+)\]\s*(.+)/, list: ['genre', 'brand', 'title'] },
		{ reg: /^\[([^\]]+)\](.+)/, list: ['brand', 'title'] }
	];

	const matched = patterns.find((p) => name.match(p.reg));

	const parsed = matched
		? zipObj(matched.list, name.match(matched.reg).slice(1))
		: {};

	return { ...base, ...parsed, file: name };
}
