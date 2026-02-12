<script>
	import { format, parseISO } from 'date-fns';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { updateComic, deleteComic as apiDeleteComic } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';
	import ReviewStars from '$lib/components/ReviewStars.svelte';
	import { reloadOnFocus } from '$lib/reload-on-focus.svelte.js';

	let name = $derived($page.params.name);
	let comics = $state(null);
	let sortKey = $state(null);

	async function load(_name) {
		comics = await fetcher(`${config.path.api}/bookshelves/${_name}`);
	}

	$effect(() => {
		comics = null;
		load(name);
	});

	reloadOnFocus(() => load(name));

	let sorted = $derived.by(() => {
		if (!comics) return [];
		if (!sortKey) return comics;
		return [...comics].sort((a, b) => {
			if (a[sortKey] < b[sortKey]) return -1;
			if (a[sortKey] > b[sortKey]) return 1;
			if (a.title < b.title) return -1;
			if (a.title > b.title) return 1;
			return 0;
		});
	});

	async function changeBookshelf(comic, n) {
		if (comic.bookshelf === n) return;
		await updateComic(comic.id, { bookshelf: n });
		addToast('Updated');
		load(name);
	}

	async function deleteComic(comic) {
		await apiDeleteComic(comic.id);
		addToast('Deleted');
		await load(name);
	}

	async function deleteAll() {
		if (!confirm('Are you sure you want to delete all comics in this bookshelf?')) return;
		await Promise.allSettled(comics.map((comic) => apiDeleteComic(comic.id)));
		addToast('Deleted all');
		await load(name);
	}

	function handleKeyDown(e) {
		if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
			e.preventDefault();
			goto(`${base}/`);
		}
	}
</script>

<svelte:head>
	<title>Bookshelf: {name}</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} />

<main id="bookshelf">
	{#if !comics}
		loading...
	{:else}
		<h2>bookshelf: {name}</h2>
		<div class="table">
			<table class="comics">
				<thead>
					<tr>
						<th class="brand" onclick={() => sortKey = 'brand'}>brand</th>
						<th class="title">title</th>
						<th class="date" onclick={() => sortKey = null}>registered</th>
						<th class="review">review</th>
						<th class="delete">
							{#if name === 'unread' || name === 'trash'}
								<span onclick={deleteAll}>🗑</span>
							{/if}
						</th>
					</tr>
				</thead>
			</table>
			<table class="comics">
				<tbody>
					{#each sorted as comic (comic.id)}
						{@const isDeleted = comic.deleted_at != null}
						<tr class:deleted={isDeleted}>
							<td class="brand">
								{#if comic.brand}
									<a href="{base}/brand/{comic.brand}">{comic.brand}</a>
								{/if}
							</td>
							<td class="title">
								{#if isDeleted}
									{comic.title || comic.file}
								{:else}
									<a href="{base}/comics/{comic.id}">{comic.title || comic.file}</a>
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
								{#if (name === 'unread' || name === 'trash') && !isDeleted}
									<span onclick={() => deleteComic(comic)}>🗑</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
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

			.brand, .date
				cursor: pointer

		tbody
			display: block
			overflow-x: hidden
			overflow-y: scroll
			width: calc(100vw - 20px)
			height: 85vh
			&::-webkit-scrollbar
				width: 10px
			&::-webkit-scrollbar-track
				background: #222
			&::-webkit-scrollbar-thumb
				background: #CCC
				border-radius: 5px
			tr
				width: 100%

		.deleted
			color: #888

		.brand
			min-width: 20vw

		.title
			width: 1000px

		.date
			min-width: 12vw

		.review
			min-width: 6vw

		.delete
			width: 2vw

			span
				cursor: pointer
</style>
