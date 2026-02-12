export function reloadOnFocus(fn) {
	$effect(() => {
		const onVisible = () => { if (document.visibilityState === 'visible') fn(); };
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});
}
