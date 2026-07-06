<script>
	import { router, navigate, getBasePath } from '$lib/router.svelte.js';
	import Header from '$lib/components/Header.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import Home from './pages/Home.svelte';
	import Bookshelf from './pages/Bookshelf.svelte';
	import Brand from './pages/Brand.svelte';
	import Comic from './pages/Comic.svelte';

	function handleClick(e) {
		const a = e.target.closest('a');
		if (!a) return;
		const href = a.getAttribute('href');
		if (!href || href.startsWith('http') || href.startsWith('//')) return;
		if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

		const base = getBasePath();
		let path = href;
		if (base && path.startsWith(base)) {
			path = path.slice(base.length) || '/';
		}

		e.preventDefault();
		navigate(path);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div onclick={handleClick}>
	<Header />
	{#if router.index === 0}
		<Home />
	{:else if router.index === 1}
		<Bookshelf params={router.params} />
	{:else if router.index === 2}
		<Brand params={router.params} />
	{:else if router.index === 3}
		<Comic params={router.params} />
	{/if}
	<Toast />
</div>

<style lang="sass">
:global
	table
		table-layout: fixed
		border-collapse: collapse
		width: 100%

		thead th
			padding: 2px 4px
			border-bottom: 1px solid var(--c-border)
			font-size: var(--fs-sm)

		tbody td
			padding: 2px 4px
			vertical-align: top

		tr
			&:hover
				background-color: var(--c-overlay-2)
</style>
