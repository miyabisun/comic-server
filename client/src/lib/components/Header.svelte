<script>
	import { base } from '$app/paths';
</script>

<header>
	<ul class="breadcrumbs">
		<li><a href="{base}/">nyaa-library</a></li>
		{#each ['unread', 'legend', 'favorite', 'like', 'hold', 'trash', 'deleted'] as shelf}
			<li><a href="{base}/bookshelves/{shelf}">{shelf}</a></li>
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
