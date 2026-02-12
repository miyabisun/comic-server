<script>
	import { format, parseISO } from 'date-fns';
	import { base } from '$app/paths';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { updateComic } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';
	import ReviewStars from '$lib/components/ReviewStars.svelte';
	import { reloadOnFocus } from '$lib/reload-on-focus.svelte.js';

	const bookshelves = ['unread', 'legend', 'favorite', 'like', 'hold', 'trash'];

	let comics = $state(null);

	async function load() {
		comics = await fetcher(`${config.path.api}/comics`);
	}

	$effect(() => {
		load();
	});

	reloadOnFocus(() => load());

	let byBookshelf = $derived.by(() => {
		if (!comics) return {};
		const grouped = {};
		comics.forEach((c) => {
			grouped[c.bookshelf] ||= [];
			grouped[c.bookshelf].push(c);
		});
		Object.keys(grouped).forEach((shelf) => {
			grouped[shelf].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
		});
		return grouped;
	});

	async function changeBookshelf(comic, name) {
		if (comic.bookshelf === name) return;
		await updateComic(comic.id, { bookshelf: name });
		addToast('Updated');
		load();
	}
</script>

<svelte:head>
	<title>nyaa-library</title>
</svelte:head>

<main id="top">
	{#if !comics}
		loading...
	{:else}
		<h1>Bookshelves</h1>
		{#each bookshelves as bookshelf}
			{@const comicList = byBookshelf[bookshelf] || []}
			<section>
				<h2>
					<a href="{base}/bookshelves/{bookshelf}">{bookshelf}</a>
					<span class="count">{comicList.length}</span>
				</h2>
				{#if comicList.length}
					<table class="comics">
						<thead>
							<tr>
								<th class="brand">brand</th>
								<th class="title">title</th>
								<th class="date">registered</th>
								<th class="review">review</th>
							</tr>
						</thead>
						<tbody>
							{#each comicList.slice(0, 10) as comic (comic.id)}
								{@const isDeleted = comic.deleted_at != null}
								<tr>
									<td class="brand">
										{#if comic.brand}
											<a href="{base}/brand/{comic.brand}">{comic.brand}</a>
										{/if}
									</td>
									<td class="title">
										<a href="{base}/comics/{comic.id}">{comic.title || comic.file}</a>
									</td>
									<td class="date">
										{format(parseISO(comic.created_at), 'yyyy-MM-dd')}
									</td>
									<td class="review">
										{#if !isDeleted}
											<ReviewStars bookshelf={comic.bookshelf} onchange={(name) => changeBookshelf(comic, name)} />
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{/each}
	{/if}
</main>

<style lang="sass">
#top
	padding: 15px

	h2
		margin-top: 12px
		.count
			margin-left: 4px
			font-size: 0.8rem
			&::before
				content: "("
			&::after
				content: ")"

	.comics
		thead
			display: block
			width: calc(100vw - 30px)
			th
				font-size: 0.8rem

		tbody
			display: block
			width: calc(100vw - 30px)

		.brand
			width: 200px
			min-width: 200px

		.title
			width: 1000px

		.date
			width: 100px
			min-width: 100px

		.review
			width: 90px
			min-width: 90px
			font-size: 0.9rem
</style>
