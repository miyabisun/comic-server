<script>
	import { levelGe } from '$lib/levels.js';

	let { bookshelf, onchange } = $props();
</script>

<ul>
	{#each ['trash', 'hold', 'like', 'favorite', 'legend'] as name}
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
		&.up
			color: #AA4
		&:hover
			color: #00F
</style>
