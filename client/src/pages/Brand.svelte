<script>
	import { format, parseISO } from 'date-fns';
	import { link, navigate } from '$lib/router.svelte.js';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { updateComic, deleteComic as apiDeleteComic } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';
	import ReviewStars from '$lib/components/ReviewStars.svelte';
	import DeleteConfirm from '$lib/components/DeleteConfirm.svelte';
	import { brandPath } from '$lib/brand.js';
	import { reloadOnFocus } from '$lib/reload-on-focus.svelte.js';

	let { params } = $props();
	let name = $derived(params.name);
	let match = $derived(params.match ?? 'fuzzy');
	let searchURL = $derived(`${config.path.api}/brands/${encodeURIComponent(name)}?match=${encodeURIComponent(match)}`);
	let comics = $state(null);
	let targets = $derived((comics ?? []).filter((comic) => comic.deleted_at == null));
	let error = $state('');
	let request = 0;
	// Single active confirmation at a time: comic.id for a row, 'all' for delete-all.
	let pendingDelete = $state(null);
	let deleting = $state(false);

	async function load(url) {
		const current = ++request;
		comics = null;
		error = '';
		pendingDelete = null;
		try {
			const result = await fetcher(url);
			if (current === request) comics = result;
		} catch (e) {
			if (current === request) error = `検索できませんでした: ${e.message}`;
		}
	}

	$effect(() => {
		load(searchURL);
		document.title = `Brand: ${name} (${match})`;
	});

	reloadOnFocus(() => load(searchURL));

	async function changeBookshelf(comic, n) {
		if (deleting || comic.bookshelf === n) return;
		await updateComic(comic.id, { bookshelf: n });
		addToast('Updated');
		load(searchURL);
	}

	async function changeAllBookshelf(n) {
		await runBulk(targets.filter((comic) => comic.bookshelf !== n),
			(comic) => updateComic(comic.id, { bookshelf: n }), 'Updated all');
	}

	async function runBulk(selected, action, message) {
		if (deleting || !selected.length) return;
		deleting = true;
		try {
			const results = await Promise.allSettled(selected.map(action));
			const failed = results.filter((result) => result.status === 'rejected').length;
			await load(searchURL);
			if (failed) error = `${selected.length}件中${failed}件の更新に失敗しました。`;
			else addToast(message);
		} finally {
			deleting = false;
			pendingDelete = null;
		}
	}

	function startDelete(id) {
		if (!deleting) pendingDelete = id;
	}

	function cancelDelete() {
		pendingDelete = null;
	}

	async function deleteComic(comic) {
		if (deleting) return;
		deleting = true;
		try {
			await apiDeleteComic(comic.id);
			addToast('Deleted');
			await load(searchURL);
		} finally {
			deleting = false;
			pendingDelete = null;
		}
	}

	async function deleteAll() {
		await runBulk(targets, (comic) => apiDeleteComic(comic.id), 'Deleted all');
	}

	function handleKeyDown(e) {
		if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) {
			e.preventDefault();
			navigate('/');
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<main id="bookshelf">
	<h2>brand: {name}</h2>
	<label class="match-mode">
		ブランド検索
		<select aria-label="ブランド検索モード" value={match} disabled={deleting || !name?.trim()}
			onchange={(e) => navigate(brandPath(name, e.currentTarget.value))}>
			<option value="fuzzy">曖昧検索</option>
			<option value="exact">完全一致</option>
		</select>
	</label>
	{#if error}<p role="alert">{error}</p>{/if}
	{#if !comics}
		{#if !error}<p role="status">loading...</p>{/if}
	{:else}
		<p class="scope" aria-live="polite">{match === 'exact' ? '完全一致' : '曖昧検索'} · 一括評価・削除の対象: 表示中の未削除 {targets.length}件</p>
		<table class="comics">
			<thead>
				<tr>
					<th class="brand">brand</th>
					<th class="title">title</th>
					<th class="date">registered</th>
					<th class="review">
						<ul>
							{#each ['hold', 'like', 'favorite', 'love', 'legend'] as n}
								<li><button type="button" class="bulk-rating" aria-label={`表示中の${targets.length}件を${n}に評価`} disabled={deleting || !targets.length} onclick={() => changeAllBookshelf(n)}>★</button></li>
							{/each}
						</ul>
					</th>
					<th class="delete">
						{#if targets.length}
							<DeleteConfirm
								active={pendingDelete === 'all'}
								{deleting}
								confirmLabel={`${targets.length}件の削除確認`}
								startAria="すべて削除"
								confirmAria="すべて削除（確認）"
								onstart={() => startDelete('all')}
								onconfirm={deleteAll}
								oncancel={cancelDelete}
							/>
						{/if}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each comics as comic (comic.id)}
					{@const isDeleted = comic.deleted_at != null}
					<tr class:deleted={isDeleted}>
						<td class="brand">{comic.brand}</td>
						<td class="title">
							{#if isDeleted}
								{comic.title || comic.file}
							{:else}
								<a href="{link('/comics/' + comic.id)}">{comic.title || comic.file}</a>
							{/if}
						</td>
						<td class="date">
							{format(parseISO(comic.created_at), 'yyyy-MM-dd HH:mm:ss')}
						</td>
						<td class="review">
							{#if !isDeleted}
								<ReviewStars bookshelf={comic.bookshelf} onchange={(n) => changeBookshelf(comic, n)} />
							{/if}
						</td>
						<td class="delete">
							{#if !isDeleted}
								<DeleteConfirm
									active={pendingDelete === comic.id}
									{deleting}
									confirmLabel="削除確認"
									startAria="この漫画を削除"
									confirmAria="この漫画を削除（確認）"
									onstart={() => startDelete(comic.id)}
									onconfirm={() => deleteComic(comic)}
									oncancel={cancelDelete}
								/>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style lang="sass">
#bookshelf
	padding: 15px

	h2
		margin-top: 12px
		overflow-wrap: anywhere

	.match-mode
		display: flex
		align-items: center
		flex-wrap: wrap
		gap: var(--sp-2)

	select
		min-height: 36px
		font: inherit
		color: var(--c-text)
		background: var(--c-bg)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)

	.scope
		font-size: var(--fs-sm)
		overflow-wrap: anywhere

	[role="alert"]
		color: var(--c-danger)

	.comics
		thead
			display: block
			overflow-x: hidden
			width: calc(100vw - 30px)

		tbody
			display: block
			overflow-x: hidden
			overflow-y: scroll
			width: calc(100vw - 20px)
			height: 85vh
			&::-webkit-scrollbar
				width: 10px
			&::-webkit-scrollbar-track
				background: var(--c-bg)
			&::-webkit-scrollbar-thumb
				background: var(--c-border)
				border-radius: 5px
			tr
				width: 100%

			td
				padding: var(--sp-1) 0
				line-height: 1.5

		.deleted
			color: var(--c-text-muted)

		.brand
			min-width: 20vw

		.title
			width: 1000px

		.date
			min-width: 12vw

		.review
			min-width: 120px

			ul
				display: flex
				margin: 0
				padding: 0
				list-style: none

				.bulk-rating
					min-width: 24px
					min-height: 24px
					padding: 0
					border: none
					background: none
					color: inherit
					cursor: pointer
					&:hover
						color: var(--c-accent)
					&:disabled
						opacity: 0.5

		.delete
			position: relative
			width: 2vw
</style>
