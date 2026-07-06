<script>
	import { format, parseISO } from 'date-fns';
	import { link, navigate } from '$lib/router.svelte.js';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { updateComic, deleteComic as apiDeleteComic } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';
	import ReviewStars from '$lib/components/ReviewStars.svelte';
	import DeleteConfirm from '$lib/components/DeleteConfirm.svelte';
	import { reloadOnFocus } from '$lib/reload-on-focus.svelte.js';

	let { params } = $props();
	let name = $derived(params.name);
	let comics = $state(null);
	// Single active confirmation at a time: comic.id for a row, 'all' for delete-all.
	let pendingDelete = $state(null);
	let deleting = $state(false);

	async function load(_name) {
		comics = await fetcher(`${config.path.api}/brands/${_name}`);
	}

	$effect(() => {
		comics = null;
		load(name);
		document.title = `Brand: ${name}`;
	});

	reloadOnFocus(() => load(name));

	async function changeBookshelf(comic, n) {
		if (comic.bookshelf === n) return;
		await updateComic(comic.id, { bookshelf: n });
		addToast('Updated');
		load(name);
	}

	async function changeAllBookshelf(n) {
		await Promise.allSettled(
			comics.filter((comic) => comic.bookshelf !== n).map((comic) => updateComic(comic.id, { bookshelf: n }))
		);
		addToast('Updated all');
		await load(name);
	}

	function startDelete(id) {
		pendingDelete = id;
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
			await load(name);
		} finally {
			deleting = false;
			pendingDelete = null;
		}
	}

	async function deleteAll() {
		if (deleting) return;
		deleting = true;
		try {
			await Promise.allSettled(comics.map((comic) => apiDeleteComic(comic.id)));
			addToast('Deleted all');
			await load(name);
		} finally {
			deleting = false;
			pendingDelete = null;
		}
	}

	function handleKeyDown(e) {
		if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
			e.preventDefault();
			navigate('/');
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<main id="bookshelf">
	{#if !comics}
		loading...
	{:else}
		<h2>brand: {name}</h2>
		<table class="comics">
			<thead>
				<tr>
					<th class="brand">brand</th>
					<th class="title">title</th>
					<th class="date">registered</th>
					<th class="review">
						<ul>
							{#each ['hold', 'like', 'favorite', 'love', 'legend'] as n}
								<li onclick={() => changeAllBookshelf(n)}>★</li>
							{/each}
						</ul>
					</th>
					<th class="delete">
						<DeleteConfirm
							active={pendingDelete === 'all'}
							{deleting}
							confirmLabel="全削除確認"
							startAria="すべて削除"
							confirmAria="すべて削除（確認）"
							onstart={() => startDelete('all')}
							onconfirm={deleteAll}
							oncancel={cancelDelete}
						/>
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

		.deleted
			color: var(--c-text-muted)

		.brand
			min-width: 20vw

		.title
			width: 1000px

		.date
			min-width: 12vw

		.review
			min-width: 6vw

			ul
				display: flex
				margin: 0
				padding: 0
				list-style: none

				li
					cursor: pointer
					&:hover
						color: var(--c-accent)

		.delete
			position: relative
			width: 2vw
</style>
