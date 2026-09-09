<script>
	let { title, message = '', help = null, onclose, onconfirm = null, keyboardConfirm = true, confirmLabel = '削除する (y)', busy = false, error = '' } = $props();
	let dialog = $state(null);
	let cancel = $state(null);
	$effect(() => {
		const element = dialog;
		if (element) {
			element.showModal();
			cancel?.focus();
			return () => element.close();
		}
	});

	function confirm() {
		if (busy) return;
		cancel?.focus();
		onconfirm?.();
	}

	function keydown(e) {
		e.stopPropagation();
		if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.altKey || e.metaKey) return;
		if ((e.repeat && ['y', 'Enter', ' '].includes(e.key)) || (keyboardConfirm && e.key === ' ' && e.target.closest('.confirm'))) { e.preventDefault(); return; }
		const close = e.key === 'Escape' || (help ? e.key === '?' : ['n', 'N'].includes(e.key) || (keyboardConfirm && e.key === 'Enter'));
		if (close) { e.preventDefault(); if (!busy) onclose(); }
		else if (e.key === 'y' && onconfirm && keyboardConfirm) {
			e.preventDefault();
			confirm();
		}
	}
</script>

<dialog bind:this={dialog} aria-label={title} onkeydown={keydown}
	oncancel={(e) => { e.preventDefault(); if (!busy) onclose(); }}>
	<h2>{title}</h2>
	{#if help}
		<dl>
			{#if help === 'list'}
				<dt>j / k</dt><dd>作品のカーソルを下 / 上へ</dd>
				<dt>Enter / Space</dt><dd>カーソルの作品を開く</dd>
			{:else}
				<dt>h / l・← / →</dt><dd>前 / 次の1ページ</dd>
				<dt>k / j・↑ / ↓</dt><dd>前 / 次の10ページ</dd>
				<dt>i</dt><dd>コミック情報を編集</dd>
			{/if}
			<dt>1 / 2 / 3 / 4 / 5</dt><dd>この1冊を hold / like / favorite / love / legend に分類</dd>
			<dt>dd → y</dt><dd>この1冊の削除確認 → 確定。n / N / Esc / Enter は取消</dd>
			<dt>b</dt><dd>この作品のブランドを完全一致検索（未設定なら移動しない）</dd>
			<dt>?</dt><dd>この操作一覧を表示 / 閉じる</dd>
		</dl>
		<p>入力・IME変換・モーダル中は通常のキー操作を止めます。一括操作は専用ボタンから確認してください。</p>
	{:else}
		<p>{message}</p>
		{#if keyboardConfirm}<p>y: 確定 / N: 取消（既定）</p>{/if}
	{/if}
	{#if error}<p role="alert">{error}</p>{/if}
	<div class="actions">
		<button bind:this={cancel} type="button" aria-disabled={busy} onclick={() => { if (!busy) onclose(); }}>{help ? '閉じる' : 'キャンセル (N)'}</button>
		{#if onconfirm}<button type="button" class="confirm" disabled={busy} onclick={confirm}>{busy ? '処理中...' : confirmLabel}</button>{/if}
	</div>
</dialog>

<style lang="sass">
dialog
	width: min(560px, 90vw)
	max-height: 85dvh
	overflow: auto
	padding: var(--sp-4)
	border: 1px solid var(--c-border)
	border-radius: var(--radius-lg)
	background: var(--c-surface)
	color: var(--c-text)
	&::backdrop
		background: var(--c-scrim)
	h2
		font-size: var(--fs-xl)
		margin-top: 0
	p, dd
		overflow-wrap: anywhere
	dl
		display: grid
		grid-template-columns: minmax(110px, 1fr) 2fr
		gap: var(--sp-2)
	dd
		margin: 0
	dt
		font-family: monospace
	[role="alert"]
		color: var(--c-danger)
	.actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: var(--sp-2)
	button
		min-height: 36px
		padding: var(--sp-1) var(--sp-3)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)
		background: transparent
		color: var(--c-text)
		cursor: pointer
		&:disabled, &[aria-disabled="true"]
			opacity: 0.5
		&.confirm
			background: var(--c-danger)
			color: var(--c-on-accent)
</style>
