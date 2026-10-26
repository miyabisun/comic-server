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
<div class:fixed={router.index > 0} onclick={handleClick}>
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
// Lists and the reader pin the page to the viewport: the header keeps its
// height and the screen below it gets the rest, so only inner areas scroll.
.fixed
	display: flex
	flex-direction: column
	height: 100dvh

	> :global(header)
		flex: none

	> :global(main)
		flex: 1
		min-height: 0

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

	// Bookshelf and Brand list pages: the rows scroll in one area, both ways,
	// under column headers that stay in place.
	#bookshelf
		display: flex
		flex-direction: column
		// The rows run to the bottom edge, as the page did before it was pinned.
		padding: 15px 15px 0

		> *
			flex: none

		h2
			margin-top: 12px
			overflow-wrap: anywhere

		.table-scroll
			flex: 1
			min-height: 0
			overflow: auto
			&::-webkit-scrollbar
				width: 10px
				height: 10px
			&::-webkit-scrollbar-track, &::-webkit-scrollbar-corner
				background: var(--c-bg)
			&::-webkit-scrollbar-thumb
				background: var(--c-border)
				border-radius: 5px

		.comics
			// Separate borders keep the header rule on the sticky cells.
			border-collapse: separate
			border-spacing: 0
			min-width: 50em

			thead th
				position: sticky
				top: 0
				z-index: 2
				background: var(--c-bg)

			tbody td
				padding: var(--sp-1) 0
				line-height: 1.5

			.deleted
				color: var(--c-text-muted)

			.brand
				width: 20%

			.date
				width: 11.5em
				white-space: nowrap

			.review
				width: 120px

			.delete
				width: 40px

			td.delete
				position: relative
</style>
