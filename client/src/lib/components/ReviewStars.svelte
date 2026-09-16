<script>
	import { levelGe } from '$lib/levels.js';

	let { bookshelf, onchange } = $props();
</script>

<ul>
	{#each ['hold', 'like', 'favorite', 'love', 'legend'] as name}
		<li
			class:up={levelGe(bookshelf, name)}
			onclick={() => onchange(name)}
		>★</li>
	{/each}
</ul>

<style lang="sass">
ul
	display: flex
	margin: 0
	padding: 0
	list-style: none

	li
		cursor: pointer
		color: var(--c-text-muted)
		&.up
			color: var(--c-star-on)
		&:hover
			color: var(--c-accent)
</style>
