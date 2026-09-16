<script>
	import { fade } from 'svelte/transition';
	import { getToasts } from '$lib/toast.svelte.js';

	let toasts = $derived(getToasts());
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div class="toast" transition:fade={{ duration: 200 }}>
				{toast.message}
			</div>
		{/each}
	</div>
{/if}

<style lang="sass">
.toast-container
	position: fixed
	bottom: 20px
	left: 50%
	transform: translateX(-50%)
	z-index: 9999
	display: flex
	flex-direction: column
	align-items: center
	gap: 8px

.toast
	padding: 8px 24px
	border-radius: var(--radius-md)
	background: var(--c-surface)
	border: 1px solid var(--c-border)
	color: var(--c-text)
	font-size: var(--fs-sm)
</style>
