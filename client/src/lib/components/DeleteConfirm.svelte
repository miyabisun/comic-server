<script>
	import Icon from './Icon.svelte';

	// Two-step inline delete confirmation. `active` shows the danger confirm
	// button + cancel; otherwise a quiet trash icon-button that starts confirm.
	let { active, deleting, confirmLabel, startAria, confirmAria, onstart, onconfirm, oncancel } = $props();
</script>

{#if active}
	<div class="confirm-box">
		<button type="button" class="delete-confirm" onclick={onconfirm} disabled={deleting} aria-label={confirmAria}>
			{deleting ? '削除中...' : confirmLabel}
		</button>
		<button type="button" class="delete-cancel" onclick={oncancel} aria-label="削除をキャンセル">キャンセル</button>
	</div>
{:else}
	<button type="button" class="icon-button" aria-label={startAria} onclick={onstart}>
		<Icon name="trash" />
	</button>
{/if}

<style lang="sass">
.icon-button
	display: inline-flex
	align-items: center
	justify-content: center
	width: 36px
	height: 36px
	padding: 0
	border: none
	border-radius: var(--radius-sm)
	background: transparent
	color: var(--c-text-sub)
	cursor: pointer

	&:hover
		color: var(--c-danger)

.confirm-box
	position: absolute
	top: 50%
	right: 0
	transform: translateY(-50%)
	z-index: 1
	display: flex
	gap: var(--sp-1)
	padding: var(--sp-1)
	background: var(--c-bg)
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)

.delete-confirm
	padding: var(--sp-1) var(--sp-2)
	font-size: var(--fs-xs)
	color: var(--c-on-accent)
	background: var(--c-danger)
	border: none
	border-radius: var(--radius-sm)
	white-space: nowrap
	cursor: pointer

	&:disabled
		opacity: 0.5
		cursor: wait

.delete-cancel
	padding: var(--sp-1) var(--sp-2)
	font-size: var(--fs-xs)
	color: var(--c-text-sub)
	background: none
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)
	white-space: nowrap
	cursor: pointer
</style>
