<script>
	import { link } from '$lib/router.svelte.js';
</script>

<header>
	<ul class="breadcrumbs">
		<li><a href="{link('/')}">comic-server</a></li>
		{#each ['unread', 'legend', 'favorite', 'like', 'hold', 'trash', 'deleted'] as shelf}
			<li><a href="{link('/bookshelves/' + shelf)}">{shelf}</a></li>
		{/each}
	</ul>
</header>

<style lang="sass">
header
	padding: 0 15px

	.breadcrumbs
		display: flex
		list-style: none
		margin: 0
		padding: 0

		li
			&::before
				content: ">"
				margin: 0 0.3rem
			&:first-of-type
				&::before
					content: ""
					margin: 0
			&:nth-of-type(2)
				&::before
					content: "|"
</style>
