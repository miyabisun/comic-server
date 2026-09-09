<script>
	import { levelGe, ratingLevels } from '$lib/levels.js';

	let { bookshelf, onchange, tabindex = 0, disabled = false } = $props();
</script>

<ul>
	{#each ratingLevels as name}
		<li><button type="button" {tabindex} {disabled} aria-label={`${name}に評価`} aria-pressed={bookshelf === name}
			class:up={levelGe(bookshelf, name)} onclick={() => onchange(name)}>★</button></li>
	{/each}
</ul>

<style lang="sass">
ul
	display: flex
	margin: 0
	padding: 0
	list-style: none

	button
		display: block
		width: 24px
		height: 24px
		padding: 0
		border: none
		background: transparent
		font: inherit
		cursor: pointer
		color: var(--c-text-muted)
		&.up
			color: var(--c-star-on)
		&:hover
			color: var(--c-accent)
</style>
