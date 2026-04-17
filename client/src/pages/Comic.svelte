<script>
	import { link } from '$lib/router.svelte.js';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { updateComic } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';
	import { levelGe } from '$lib/levels.js';
	import { createHoldRepeat } from '$lib/hold-repeat.svelte.js';
	import { reloadOnFocus } from '$lib/reload-on-focus.svelte.js';

	let { params } = $props();
	let id = $derived(params.id);
	let comic = $state(null);
	let tmpComic = $state({});
	let imgPointer = $state(1);
	let showInfo = $state(false);

	const prev = createHoldRepeat(() => { imgPointer = Math.max(imgPointer - 1, 1); }, { interval: 100 });
	const next = createHoldRepeat(() => { imgPointer = Math.min(imgPointer + 1, comic?.images?.length || 1); });
	const back = createHoldRepeat(() => { imgPointer = Math.max(imgPointer - 10, 1); });
	const skip = createHoldRepeat(() => { imgPointer = Math.min(imgPointer + 10, comic?.images?.length || 1); });

	async function load(_id) {
		comic = await fetcher(`${config.path.api}/comics/${_id}`);
	}

	$effect(() => {
		comic = null;
		imgPointer = 1;
		load(id);
	});

	$effect(() => {
		document.title = comic?.file || 'loading...';
	});

	reloadOnFocus(() => load(id));

	function handleKeyDown(e) {
		if (!comic || showInfo) return;
		switch (e.key) {
			case 'ArrowLeft':
				imgPointer = Math.max(imgPointer - 1, 1);
				prev.pressed = true;
				break;
			case 'ArrowRight':
				imgPointer = Math.min(imgPointer + 1, comic.images.length);
				next.pressed = true;
				break;
			case 'ArrowUp':
				e.preventDefault();
				imgPointer = Math.max(imgPointer - 10, 1);
				back.pressed = true;
				break;
			case 'ArrowDown':
				e.preventDefault();
				imgPointer = Math.min(imgPointer + 10, comic.images.length);
				skip.pressed = true;
				break;
			case 'Backspace':
				if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
					e.preventDefault();
					history.back();
				}
				break;
		}
	}

	function handleKeyUp(e) {
		if (!comic) return;
		switch (e.key) {
			case 'ArrowLeft': prev.pressed = false; break;
			case 'ArrowRight': next.pressed = false; break;
			case 'ArrowUp': back.pressed = false; break;
			case 'ArrowDown': skip.pressed = false; break;
		}
	}

	async function changeBookshelf(n) {
		if (comic.bookshelf === n) return;
		await updateComic(comic.id, { bookshelf: n });
		addToast('Updated');
		load(id);
	}

	async function handleSubmit(e) {
		e.preventDefault();
		if (Object.keys(tmpComic).length === 0) return;
		await updateComic(comic.id, tmpComic);
		addToast('Updated');
		tmpComic = {};
		load(id);
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

	function setCustomPathDir(dir) {
		setField('custom_path', `^${escapeRegExp(dir)}\\/`);
	}
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<main id="comic">
	{#if !comic}
		loading...
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
					{#each ['hold', 'like', 'favorite', 'love', 'legend'] as n}
						<li
							class:up={levelGe(comic.bookshelf, n)}
							onclick={() => changeBookshelf(n)}
						>★</li>
					{/each}
				</ul>
			</div>
			<button class="info-button" onclick={() => { showInfo = true; }}>ℹ</button>
		</div>

		{#if showInfo}
			<div class="modal-overlay" onclick={() => { tmpComic = {}; showInfo = false; }}>
				<div class="modal" onclick={(e) => e.stopPropagation()}>
					<div class="modal-header">
						<h3>{comic.file}</h3>
						<button class="modal-close" onclick={() => { tmpComic = {}; showInfo = false; }}>✕</button>
					</div>
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
											{#if n === 'brand'}
												<a href="{link('/brand/' + getField('brand'))}">{n}</a>
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
								<input type="submit" value="update" />
							</form>
						</div>
						<div class="modal-files">
							<div class="file-preview-header">images ({comic['origin-images']?.length || 0})</div>
							<ol class="file-preview">
								{#each comic['origin-images'] || [] as img, i}
									{@const excluded = customPathRegex ? !customPathRegex.test(img) : false}
									<li class:excluded><span>{img}</span></li>
								{/each}
							</ol>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</main>

<style lang="sass">
$height: calc(100vh - 22px)

#comic
	background-color: rgba(255, 255, 255, 0.85)
	color: rgba(0, 0, 0, 0.85)

	.canvas
		height: fit-content
		position: relative
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
		border-radius: 8px
		background: rgba(255, 255, 255, 0.4)

	.review
		display: flex
		align-items: center
		position: absolute
		top: 2px
		left: 2px
		padding: 2px 4px
		border-radius: 8px
		background: rgba(255, 255, 255, 0.4)

		ul
			display: flex
			margin: 0
			padding: 0
			list-style: none

			li
				&.up
					color: #AA4
					cursor: pointer
				&:hover
					color: #00F
					cursor: pointer

	.info-button
		position: fixed
		bottom: 28px
		left: 8px
		width: 32px
		height: 32px
		padding: 0
		border: none
		border-radius: 50%
		background-color: rgba(255, 255, 255, 0.8)
		font-size: 16px
		line-height: 32px
		text-align: center
		cursor: pointer
		user-select: none
		z-index: 10

		&:hover
			background-color: rgba(255, 255, 255, 1)

	.modal-overlay
		position: fixed
		top: 0
		left: 0
		width: 100%
		height: 100%
		background-color: rgba(0, 0, 0, 0.5)
		display: flex
		align-items: center
		justify-content: center
		z-index: 100

	.modal
		background: #fff
		border-radius: 8px
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
				font-size: 0.9rem
				overflow: hidden
				text-overflow: ellipsis
				white-space: nowrap

		.modal-close
			border: none
			background: none
			font-size: 1.2rem
			cursor: pointer
			padding: 0 4px

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

				label
					display: block
					margin: 10px 0

				span
					display: block
					font-size: 0.8rem
					font-weight: bold

				input
					display: block
					width: 100%

					&.invalid
						border-color: #c33
						outline-color: #c33

				.custom-path-section
					margin: 10px 0

					.regex-error
						color: #c33
						font-size: 0.75rem
						margin-top: 2px

					.dir-buttons
						display: flex
						flex-wrap: wrap
						gap: 4px
						margin-top: 4px

						button
							font-size: 0.75rem
							padding: 2px 8px
							border: 1px solid #999
							border-radius: 4px
							background: #f0f0f0
							cursor: pointer

							&:hover
								background: #ddd

		.modal-files
			flex: 1
			min-width: 0
			display: flex
			flex-direction: column

			@media (max-width: 1199px)
				margin-top: 12px

			.file-preview-header
				font-size: 0.8rem
				font-weight: bold
				margin-bottom: 4px

			.file-preview
				margin: 0
				padding: 0
				flex: 1
				min-height: 200px
				max-height: 60vh
				overflow-y: auto
				border: 1px solid #ddd
				border-radius: 4px
				font-size: 0.75rem
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
						color: #999
						border-right: 1px solid #ddd
						margin-right: 8px
						flex-shrink: 0
						user-select: none

					&.excluded
						color: #c33

						> span
							text-decoration: line-through

						&::before
							color: #c99

					&:hover
						background: #f6f8fa
</style>
