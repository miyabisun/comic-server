<script>
	import { onDestroy, untrack } from 'svelte';
	import ComicDialog from '$lib/components/ComicDialog.svelte';
	import { commandKey, createDeleteSequence, ratingForKey, readerMove } from '$lib/keyboard.js';
	import { brandPath } from '$lib/brand.js';
	import { link, navigate } from '$lib/router.svelte.js';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { updateComic, deleteComic, startUpscale, confirmUpscale, rollbackUpscale, getUpscaleStatus, startRemaster, cancelRemaster, getRemasterStatus } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';
	import { levelGe, ratingLevels } from '$lib/levels.js';
	import { createHoldRepeat } from '$lib/hold-repeat.svelte.js';
	import { reloadOnFocus } from '$lib/reload-on-focus.svelte.js';
	import Icon from '$lib/components/Icon.svelte';

	let { params } = $props();
	let id = $derived(params.id);
	let comic = $state(null);
	let tmpComic = $state({});
	let imgPointer = $state(1);
	let showInfo = $state(false);
	let showHelp = $state(false);
	let pendingDelete = $state(null);
	let busy = $state(false);
	let operationError = $state('');
	let active = true;
	let loadRequest = 0;
	const sequence = createDeleteSequence();
	onDestroy(() => { active = false; });
	let infoDialog = $state(null);
	$effect(() => {
		const dialog = infoDialog;
		if (showInfo && dialog) {
			dialog.showModal();
			return () => dialog.close();
		}
	});

	const prev = createHoldRepeat(() => { imgPointer = Math.max(imgPointer - 1, 1); }, { interval: 100 });
	const next = createHoldRepeat(() => { imgPointer = Math.min(imgPointer + 1, comic?.images?.length || 1); });
	const back = createHoldRepeat(() => { imgPointer = Math.max(imgPointer - 10, 1); });
	const skip = createHoldRepeat(() => { imgPointer = Math.min(imgPointer + 10, comic?.images?.length || 1); });

	function stopPages() {
		prev.pressed = next.pressed = back.pressed = skip.pressed = false;
	}
	function pageController(delta) {
		return ({ '-1': prev, '1': next, '-10': back, '10': skip })[delta];
	}
	$effect(() => { if (showInfo || showHelp || pendingDelete || busy) stopPages(); });

	async function load(_id) {
		const request = ++loadRequest;
		try {
			const result = await fetcher(`${config.path.api}/comics/${_id}`);
			if (active && request === loadRequest && _id === id) { comic = result; return true; }
		} catch (e) {
			if (active && request === loadRequest) operationError = `コミックを取得できませんでした: ${e.message}`;
		}
		return false;
	}

	$effect(() => {
		const current = id;
		untrack(() => {
			comic = null;
			tmpComic = {};
			imgPointer = 1;
			showInfo = showHelp = false;
			pendingDelete = null;
			operationError = '';
			sequence.reset();
			stopPages();
			load(current);
		});
	});

	$effect(() => { document.title = comic?.file || 'loading...'; });
	reloadOnFocus(() => { if (!busy && !pendingDelete) load(id); });

	function handleKeyDown(e) {
		let key = commandKey(e);
		if (showInfo || showHelp || pendingDelete || busy || document.querySelector('dialog[open]')) key = null;
		const deleting = sequence.press(key, comic?.id, e.repeat);
		if (!key) { stopPages(); return; }
		if (key === '?' && !e.repeat) { e.preventDefault(); showHelp = true; return; }
		if (!comic) return;
		const delta = readerMove(key);
		if (delta != null) {
			e.preventDefault();
			const controller = pageController(delta);
			if (!e.repeat && !controller.pressed) {
				imgPointer = Math.max(1, Math.min(comic.images.length || 1, imgPointer + delta));
				controller.pressed = true;
			}
			return;
		}
		if (e.repeat) {
			if (ratingForKey(key) || ['d', 'Enter', ' '].includes(key)) e.preventDefault();
			return;
		}
		if (ratingForKey(key)) { e.preventDefault(); changeBookshelf(ratingForKey(key)); }
		else if (key === 'i') { e.preventDefault(); showInfo = true; }
		else if (key === 'b') {
			e.preventDefault();
			const path = brandPath(comic.brand, 'exact');
			if (path) navigate(path); else addToast('ブランドが未設定です');
		} else if (key === 'd') {
			e.preventDefault();
			if (deleting && !comic.deleted_at) {
				const { id, title, file, brand, bookshelf } = comic;
				operationError = '';
				pendingDelete = { id, title, file, brand, bookshelf };
			}
		} else if (key === 'Backspace') { e.preventDefault(); history.back(); }
	}

	function handleKeyUp(e) {
		const delta = readerMove(e.key);
		if (delta != null) pageController(delta).pressed = false;
	}

	async function changeBookshelf(n) {
		if (busy || !comic || comic.deleted_at || comic.bookshelf === n) return;
		busy = true;
		operationError = '';
		try {
			await updateComic(comic.id, { bookshelf: n });
			if (await load(id)) addToast('Updated');
		} catch (e) { operationError = `評価を変更できませんでした: ${e.message}`; }
		finally { busy = false; }
	}

	async function confirmDelete() {
		if (busy || !pendingDelete) return;
		const target = pendingDelete;
		busy = true;
		operationError = '';
		try {
			await deleteComic(target.id);
			if (active && id === String(target.id)) {
				navigate(brandPath(target.brand, 'exact') ?? '/bookshelves/' + encodeURIComponent(target.bookshelf));
			}
		} catch (e) { operationError = `削除できませんでした: ${e.message}`; }
		finally { busy = false; }
	}

	function closeCommandDialog() {
		if (busy) return;
		pendingDelete = null;
		showHelp = false;
		sequence.reset();
	}

	async function handleSubmit(e) {
		e.preventDefault();
		if (busy || Object.keys(tmpComic).length === 0) return;
		busy = true;
		operationError = '';
		try {
			await updateComic(comic.id, tmpComic);
			if (await load(id)) { addToast('Updated'); tmpComic = {}; }
		} catch (e) { operationError = `保存できませんでした: ${e.message}`; }
		finally { busy = false; }
	}

	async function reParse() {
		try {
			const parsed = await fetcher(`${config.path.api}/parse?name=${encodeURIComponent(tmpComic.file || comic.file)}`);
			tmpComic = { ...tmpComic, ...parsed };
		} catch {
			addToast('Parse failed');
		}
	}

	function createNewFile() {
		const getName = (k) => tmpComic[k] != null ? tmpComic[k] : comic[k];
		const file = [
			getName('genre') ? `(${getName('genre')})` : '',
			getName('brand') ? `[${getName('brand')}]` : '',
			getName('title'),
			getName('original') ? `(${getName('original')})` : ''
		].filter(Boolean).join(' ');
		tmpComic = { ...tmpComic, file };
	}

	function getField(n) {
		return (tmpComic[n] != null ? tmpComic[n] : comic[n]) || '';
	}

	function setField(n, value) {
		tmpComic = { ...tmpComic, [n]: value };
	}

	let customPathParsed = $derived.by(() => {
		const pattern = getField('custom_path');
		if (!pattern) return { regex: null, error: '' };
		try {
			return { regex: new RegExp(pattern), error: '' };
		} catch (e) {
			return { regex: null, error: e.message };
		}
	});

	let customPathRegex = $derived(customPathParsed.regex);
	let customPathError = $derived(customPathParsed.error);

	let directories = $derived.by(() => {
		if (!comic?.['origin-images']) return [];
		const dirs = new Set();
		for (const img of comic['origin-images']) {
			const slash = img.indexOf('/');
			if (slash !== -1) dirs.add(img.substring(0, slash));
		}
		return [...dirs].sort();
	});

	function escapeRegExp(s) {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	let imagesSet = $derived(new Set(comic?.images || []));

	function setCustomPathDir(dir) {
		setField('custom_path', `^${escapeRegExp(dir)}\\/`);
	}

	function jumpToImage(filename) {
		if (!comic?.images) return;
		const idx = comic.images.indexOf(filename);
		if (idx !== -1) {
			imgPointer = idx + 1;
		}
	}

	let upscaleStatus = $state({ status: 'idle' });
	let remasterStatus = $state({ status: 'loading' });
	let remasterBusy = $state(false);

	async function refreshRemasterStatus() {
		if (!comic) return;
		const cid = comic.id;
		try {
			const status = await getRemasterStatus(cid);
			if (comic?.id === cid) remasterStatus = status;
		} catch (e) {
			if (comic?.id === cid) remasterStatus = { status: 'error', error: e.message };
		}
	}

	async function handleRemaster(cancel = false) {
		remasterBusy = true;
		try {
			await (cancel ? cancelRemaster(comic.id) : startRemaster(comic.id));
			await refreshRemasterStatus();
		} catch (e) {
			addToast(`リマスター: ${e.message}`);
		} finally {
			remasterBusy = false;
		}
	}

	async function refreshUpscaleStatus() {
		if (!comic) return;
		try {
			upscaleStatus = await getUpscaleStatus(comic.id);
		} catch (e) {
			console.error(e);
		}
	}

	// Poll upscale status while the modal is open.
	// Depends only on showInfo and comic?.id so the timer stays stable across
	// comic object reassignments (e.g. load(id) refetching after a mutation).
	$effect(() => {
		const cid = comic?.id;
		if (!showInfo || !cid) return;
		remasterStatus = { status: 'loading' };
		refreshUpscaleStatus();
		refreshRemasterStatus();
		const timer = setInterval(() => { refreshUpscaleStatus(); refreshRemasterStatus(); }, 2000);
		return () => clearInterval(timer);
	});

	async function handleStartUpscale() {
		try {
			await startUpscale(comic.id);
			addToast('Upscale started');
			await refreshUpscaleStatus();
		} catch (e) {
			addToast(`Failed: ${e.message}`);
		}
	}

	async function handleConfirmUpscale() {
		try {
			await confirmUpscale(comic.id);
			addToast('Confirmed');
			await refreshUpscaleStatus();
			load(id);
		} catch (e) {
			addToast(`Failed: ${e.message}`);
		}
	}

	async function handleRollbackUpscale() {
		try {
			await rollbackUpscale(comic.id);
			addToast('Rolled back');
			await refreshUpscaleStatus();
			load(id);
		} catch (e) {
			addToast(`Failed: ${e.message}`);
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} onblur={() => { stopPages(); sequence.reset(); }} onfocusin={() => sequence.reset()} />

<main id="comic">
	{#if operationError && !showInfo && !pendingDelete}<p class="operation-error" role="alert">{operationError}</p>{/if}
	{#if !comic}
		{#if !operationError}loading...{/if}
	{:else}
		<div class="canvas">
			<ul class="images" style="transform: translateX(-{(imgPointer - 1) * 100}vw)">
				{#if comic.images.length > 0}
					{#each comic.images as it (it)}
						<li>
							<img src="{config.path.images}/{comic.bookshelf}/{comic.file}/{encodeURI(it)}" alt="" loading="lazy" />
						</li>
					{/each}
				{:else}
					<li></li>
				{/if}
			</ul>
			<div class="page">{imgPointer} / {comic.images.length}</div>
			<div class="review">
				<ul>
					{#each ratingLevels as n}
						<li><button type="button" aria-label={`${n}に評価`} aria-pressed={comic.bookshelf === n} disabled={busy || comic.deleted_at != null}
							class:up={levelGe(comic.bookshelf, n)} onclick={() => changeBookshelf(n)}>★</button></li>
					{/each}
				</ul>
			</div>
			<button class="info-button help-button" aria-label="閲覧のショートカット" onclick={() => { sequence.reset(); showHelp = true; }}>?</button>
			<button class="info-button" aria-label="情報を表示" onclick={() => { showInfo = true; }}>
				<Icon name="info" />
			</button>
		</div>

		{#if showInfo}
			<dialog class="modal-overlay" bind:this={infoDialog} aria-label="コミック情報" oncancel={(e) => { e.preventDefault(); tmpComic = {}; showInfo = false; }} onclick={(e) => { if (e.target === infoDialog) { tmpComic = {}; showInfo = false; } }}>
				<div class="modal">
					<div class="modal-header">
						<h3>{comic.file}</h3>
						<button class="modal-close" aria-label="閉じる" onclick={() => { tmpComic = {}; showInfo = false; }}>
							<Icon name="x" />
						</button>
					</div>
					<div class="upscale-section">
						{#if upscaleStatus.status === 'idle'}
							<button type="button" class="upscale-btn start" onclick={handleStartUpscale}>アップスケール申請</button>
						{:else if upscaleStatus.status === 'processing'}
							<div class="upscale-progress">
								<span class="label">処理中</span>
								<span class="count">{upscaleStatus.processed ?? 0} / {upscaleStatus.total ?? '?'}</span>
								{#if upscaleStatus.currentFile}
									<span class="file">{upscaleStatus.currentFile}</span>
								{/if}
							</div>
						{:else if upscaleStatus.status === 'pending'}
							<div class="upscale-pending">
								<span class="label">確認待ち</span>
								<button type="button" class="upscale-btn confirm" onclick={handleConfirmUpscale}>確定</button>
								<button type="button" class="upscale-btn rollback" onclick={handleRollbackUpscale}>ロールバック</button>
							</div>
						{/if}
					</div>
					<section class="upscale-section remaster-section" aria-labelledby="remaster-heading">
						<h4 id="remaster-heading">リマスター</h4>
						<p>原本を残し、画質を改善した「リマスター版」を別作品として作成します。</p>
						<div aria-live="polite">
							{#if remasterStatus.status === 'loading'}
								<p>状況を確認しています…</p>
							{:else if remasterStatus.status === 'processing'}
								<p>処理中: {remasterStatus.processed ?? 0} / {remasterStatus.total || '?'} ページ</p>
								<button type="button" class="upscale-btn" disabled={remasterBusy} onclick={() => handleRemaster(true)}>リマスターを中止</button>
							{:else if remasterStatus.status === 'completed'}
								{#if remasterStatus.outputComicId === comic.id}
									<p>この作品はリマスター版です。</p>
								{:else}
									<a href={link('/comics/' + remasterStatus.outputComicId)}>リマスター版を開く</a>
								{/if}
							{:else if remasterStatus.status === 'error'}
								<p role="alert">状況を取得できませんでした: {remasterStatus.error}</p>
								<button type="button" class="upscale-btn" onclick={refreshRemasterStatus}>状況を再取得</button>
							{:else}
								{#if remasterStatus.status === 'failed'}
									<p role="alert">{remasterStatus.error === 'Remaster cancelled' ? 'リマスターを中止しました。原本は保持されています。' : `リマスターに失敗しました: ${remasterStatus.error}`}</p>
								{/if}
								{#if remasterStatus.available === false}
									<p>リマスター機能は未設定です。READMEのセットアップ手順を確認してください。</p>
								{:else}
									<button type="button" class="upscale-btn" disabled={remasterBusy} onclick={() => handleRemaster()}>リマスターを開始</button>
								{/if}
							{/if}
						</div>
					</section>
					{#if operationError}<p role="alert">{operationError}</p>{/if}
					<div class="modal-body">
						<div class="modal-form">
							<form onsubmit={handleSubmit}>
								<div class="buttons">
									<button type="button" onclick={reParse}>re parse</button>
									<button type="button" onclick={createNewFile}>create new file</button>
								</div>
								{#each ['brand', 'genre', 'title', 'original', 'file'] as n}
									<label>
										<span>
											{#if n === 'brand' && brandPath(getField('brand'))}
												<a href="{link(brandPath(getField('brand')))}">{n}</a>
											{:else}
												{n}
											{/if}
										</span>
										<input
											value={getField(n)}
											oninput={(e) => setField(n, e.target.value)}
										/>
									</label>
								{/each}
								<div class="custom-path-section">
									<label>
										<span>custom_path</span>
										<input
											value={getField('custom_path')}
											oninput={(e) => setField('custom_path', e.target.value)}
											class:invalid={customPathError}
										/>
									</label>
									{#if customPathError}
										<div class="regex-error">{customPathError}</div>
									{/if}
									{#if directories.length > 0}
										<div class="dir-buttons">
											{#each directories as dir}
												<button type="button" onclick={() => setCustomPathDir(dir)}>{dir}/</button>
											{/each}
										</div>
									{/if}
								</div>
								<input type="submit" value="update" disabled={busy} />
							</form>
						</div>
						<div class="modal-files">
							<div class="file-preview-header">images ({comic['origin-images']?.length || 0})</div>
							<ol class="file-preview">
								{#each comic['origin-images'] || [] as img, i}
									{@const excluded = customPathRegex ? !customPathRegex.test(img) : false}
									{@const clickable = !excluded && imagesSet.has(img)}
									<li class:excluded><button type="button" disabled={!clickable} aria-current={img === comic.images[imgPointer - 1] ? 'page' : undefined} onclick={() => jumpToImage(img)}>{img}</button></li>
								{/each}
							</ol>
						</div>
					</div>
				</div>
			</dialog>
		{/if}
	{/if}
</main>

{#if showHelp}<ComicDialog title="閲覧のショートカット" help="reader" onclose={closeCommandDialog} />{/if}
{#if pendingDelete}<ComicDialog title="コミックを削除" message={`「${pendingDelete.title || pendingDelete.file}」を削除しますか？`} error={operationError} {busy} onclose={closeCommandDialog} onconfirm={confirmDelete} />{/if}

<style lang="sass">
$height: calc(100vh - 22px)

#comic
	background-color: var(--c-bg)
	color: var(--c-text)

	.canvas
		height: fit-content
		position: relative
		/* domain exception: reader checkerboard stays light in both themes (see docs/DESIGN.md) */
		background-color: white
		background-image: linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)
		background-position: 0 0, 30px 30px
		background-size: 60px 60px
		overflow-x: hidden

	.images
		display: flex
		align-items: center

		li
			position: relative
			flex-shrink: 0
			width: 100vw
			height: $height

			img
				width: 100%
				height: $height
				object-fit: contain
				pointer-events: none

	.page
		display: flex
		align-items: center
		position: absolute
		top: 0
		right: 4px
		padding: 2px 4px
		border-radius: var(--radius-md)
		background: var(--c-scrim)
		color: var(--c-on-scrim)

	.review
		display: flex
		align-items: center
		position: absolute
		top: 2px
		left: 2px
		padding: 2px 4px
		border-radius: var(--radius-md)
		background: var(--c-scrim)
		color: var(--c-on-scrim)

		ul
			display: flex
			margin: 0
			padding: 0
			list-style: none

			button
				min-width: 36px
				min-height: 36px
				padding: 0
				border: 0
				background: transparent
				color: inherit
				font: inherit
				cursor: pointer
				&.up
					color: var(--c-star-on)
					cursor: pointer
				&:hover
					color: var(--c-accent)
					cursor: pointer

	.info-button
		display: flex
		align-items: center
		justify-content: center
		position: fixed
		bottom: 28px
		left: 8px
		width: 36px
		height: 36px
		padding: 0
		border: none
		border-radius: var(--radius-sm)
		background-color: var(--c-scrim)
		color: var(--c-on-scrim)
		cursor: pointer
		user-select: none
		z-index: 10

		&:hover
			background-color: var(--c-scrim-strong)

	.help-button
		left: 52px

	.operation-error
		position: fixed
		top: 72px
		left: var(--sp-2)
		z-index: 20
		max-width: 90vw
		padding: var(--sp-2)
		background: var(--c-scrim)
		color: var(--c-on-scrim)
		overflow-wrap: anywhere

	.modal-overlay
		margin: 0
		padding: 0
		border: none
		max-width: none
		max-height: none
		&::backdrop
			background: transparent
		position: fixed
		top: 0
		left: 0
		width: 100%
		height: 100%
		background-color: var(--c-scrim)
		display: flex
		align-items: center
		justify-content: center
		z-index: 100

	.modal
		background: var(--c-surface)
		color: var(--c-text)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-lg)
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25)
		padding: 16px 24px
		max-width: 640px
		width: 90vw
		max-height: 90vh
		overflow-y: auto

		@media (min-width: 1200px)
			max-width: 1100px

		.modal-header
			display: flex
			justify-content: space-between
			align-items: center
			margin-bottom: 8px

			h3
				margin: 0
				font-size: var(--fs-sm)
				overflow: hidden
				text-overflow: ellipsis
				white-space: nowrap
				color: var(--c-text)

		.modal-close
			display: inline-flex
			align-items: center
			justify-content: center
			width: 36px
			height: 36px
			border: none
			background: none
			border-radius: var(--radius-sm)
			cursor: pointer
			padding: 0
			color: var(--c-text-sub)

			&:hover
				color: var(--c-text)

		.remaster-section
			h4, p
				margin: 0 0 var(--sp-2)
				font-size: var(--fs-sm)
				overflow-wrap: anywhere
			[role="alert"]
				color: var(--c-danger)
			button:disabled
				opacity: 0.6
				cursor: wait

		.upscale-section
			margin: 8px 0 12px
			padding: 8px 12px
			background: var(--c-overlay-1)
			border: 1px solid var(--c-border)
			border-radius: var(--radius-sm)

			.upscale-btn
				min-height: 36px
				font-size: var(--fs-sm)
				padding: 4px 12px
				border: 1px solid var(--c-border)
				border-radius: var(--radius-sm)
				cursor: pointer
				background: transparent
				color: var(--c-text)

				&:hover
					background: var(--c-overlay-2)

				&.confirm
					background: var(--c-accent)
					border-color: var(--c-accent)
					color: var(--c-on-accent)

					&:hover
						background: var(--c-accent-hover)

				&.rollback
					background: transparent
					border-color: var(--c-danger-border)
					color: var(--c-danger)

					&:hover
						background: var(--c-danger-bg)

			.upscale-progress,
			.upscale-pending
				display: flex
				flex-wrap: wrap
				align-items: center
				gap: 8px
				font-size: var(--fs-xs)

				.label
					font-weight: bold
					color: var(--c-text-sub)

				.count
					font-family: monospace
					color: var(--c-text)

				.file
					font-family: monospace
					color: var(--c-text-muted)
					font-size: var(--fs-xs)
					overflow: hidden
					text-overflow: ellipsis
					white-space: nowrap
					max-width: 100%

		.modal-body
			@media (min-width: 1200px)
				display: flex
				gap: 16px

		.modal-form
			flex: 1
			min-width: 0

			form
				.buttons
					margin-bottom: 8px

					button
						background: transparent
						color: var(--c-text)
						border: 1px solid var(--c-border)
						border-radius: var(--radius-sm)
						padding: 4px 12px
						cursor: pointer

						&:hover
							background: var(--c-overlay-2)

				label
					display: block
					margin: 10px 0

				span
					display: block
					font-size: var(--fs-sm)
					font-weight: bold
					color: var(--c-text-sub)

				input
					display: block
					width: 100%
					background: var(--c-bg)
					color: var(--c-text)
					border: 1px solid var(--c-border)
					border-radius: var(--radius-sm)
					padding: 4px 8px

					&:focus
						border-color: var(--c-accent)

					&.invalid
						border-color: var(--c-danger)

				input[type="submit"]
					background: transparent
					border: 1px solid var(--c-border)
					color: var(--c-text)
					cursor: pointer
					margin-top: 12px

					&:hover
						background: var(--c-overlay-2)

				.custom-path-section
					margin: 10px 0

					.regex-error
						color: var(--c-danger)
						font-size: var(--fs-xs)
						margin-top: 2px

					.dir-buttons
						display: flex
						flex-wrap: wrap
						gap: 4px
						margin-top: 4px

						button
							font-size: var(--fs-xs)
							padding: 2px 8px
							border: 1px solid var(--c-border)
							border-radius: var(--radius-sm)
							background: transparent
							color: var(--c-text-sub)
							cursor: pointer

							&:hover
								background: var(--c-overlay-2)

		.modal-files
			flex: 1
			min-width: 0
			display: flex
			flex-direction: column

			@media (max-width: 1199px)
				margin-top: 12px

			.file-preview-header
				font-size: var(--fs-sm)
				font-weight: bold
				margin-bottom: 4px
				color: var(--c-text-sub)

			.file-preview
				margin: 0
				padding: 0
				flex: 1
				min-height: 200px
				max-height: 60vh
				overflow-y: auto
				border: 1px solid var(--c-border)
				border-radius: var(--radius-sm)
				font-size: var(--fs-xs)
				font-family: monospace
				counter-reset: line-number

				li
					display: flex
					counter-increment: line-number

					&::before
						content: counter(line-number)
						display: inline-block
						min-width: 3em
						padding: 1px 8px 1px 0
						text-align: right
						color: var(--c-text-muted)
						border-right: 1px solid var(--c-border)
						margin-right: 8px
						flex-shrink: 0
						user-select: none

					button
						min-width: 0
						min-height: 24px
						padding: 0
						border: 0
						background: transparent
						color: inherit
						font: inherit
						text-align: left
						cursor: pointer

					&.excluded
						color: var(--c-danger)
						opacity: 0.6

						> button
							text-decoration: line-through

						&::before
							color: var(--c-danger-dim)

					&:hover:not(.excluded)
						background: var(--c-overlay-2)
</style>
