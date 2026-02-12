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

	async function load(_name) {
		comics = await fetcher(`${config.path.api}/brands/${_name}`);
	}

	$effect(() => {
		comics = null;
		load(name);
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

	async function deleteComic(comic) {
		await apiDeleteComic(comic.id);
		addToast('Deleted');
		load(name);
	}

	async function deleteAll() {
		if (!confirm('Are you sure you want to delete all comics for this brand?')) return;
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
	<title>Brand: {name}</title>
</svelte:head>

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
							{#each ['trash', 'hold', 'like', 'favorite', 'legend'] as n}
								<li onclick={() => changeAllBookshelf(n)}>★</li>
							{/each}
						</ul>
					</th>
					<th class="delete">
						<span onclick={deleteAll}>🗑</span>
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
							{#if !isDeleted}
								<span onclick={() => deleteComic(comic)}>🗑</span>
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

			ul
				display: flex
				margin: 0
				padding: 0
				list-style: none

				li
					cursor: pointer
					&:hover
						color: #00F

		.delete
			width: 2vw

			span
				cursor: pointer
</style>
