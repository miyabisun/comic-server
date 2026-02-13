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
		if (!comic) return;
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
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<main id="comic">
	{#if !comic}
		loading...
	{:else}
		<div class="canvas" onclick={() => { if (showInfo) { tmpComic = {}; showInfo = false; } }}>
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
					{#each ['trash', 'hold', 'like', 'favorite', 'legend'] as n}
						<li
							class:up={levelGe(comic.bookshelf, n)}
							onclick={() => changeBookshelf(n)}
						>★</li>
					{/each}
				</ul>
			</div>
			<div class="info">
				{#if showInfo}
					<form onclick={(e) => e.stopPropagation()} onsubmit={handleSubmit}>
						<div class="buttons">
							<button type="button" onclick={reParse}>re parse</button>
							<button type="button" onclick={createNewFile}>create new file</button>
						</div>
						{#each ['brand', 'genre', 'title', 'original', 'file', 'custom_path'] as n}
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
						<input type="submit" value="update" />
					</form>
				{/if}
				<div class="button" onclick={(e) => { e.stopPropagation(); showInfo = !showInfo; }}>ℹ</div>
			</div>
		</div>
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

	.info
		position: absolute
		bottom: 2px
		left: 0

		.button
			padding: 0 8px
			border-radius: 16px
			background-color: rgba(255, 255, 255, 0.8)
			font-size: 0.8rem
			cursor: pointer

		form
			width: 600px
			padding: 8px
			border-radius: 8px
			background-color: rgba(255, 255, 255, 0.8)

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
</style>
