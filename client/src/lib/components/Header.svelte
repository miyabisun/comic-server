<script>
	import { link, router } from '$lib/router.svelte.js';

	const shelves = ['unread', 'legend', 'love', 'favorite', 'like', 'hold', 'deleted'];

	function isActive(shelf) {
		return router.index === 1 && router.params.name === shelf;
	}
</script>

<header>
	<a class="brand" href="{link('/')}">comic-server</a>
	<nav class="tabs">
		{#each shelves as shelf}
			<a class="tab" class:active={isActive(shelf)} href="{link('/bookshelves/' + shelf)}">{shelf}</a>
		{/each}
	</nav>
</header>

<style lang="sass">
header
	display: flex
	align-items: center
	padding: 0 var(--sp-4)

.brand
	color: var(--c-text)
	font-weight: 500
	padding: var(--sp-3) var(--sp-4) var(--sp-3) 0
	margin-right: var(--sp-4)
	border-right: 1px solid var(--c-border)

.tabs
	display: flex
	align-items: center
	overflow-x: auto

.tab
	padding: var(--sp-3) var(--sp-3)
	color: var(--c-text-sub)
	font-size: var(--fs-md)
	font-weight: 500
	border-bottom: 2px solid transparent
	white-space: nowrap

	&:hover
		color: var(--c-text)

	&.active
		color: var(--c-text)
		border-bottom-color: var(--c-accent)
</style>
