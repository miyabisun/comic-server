<script>
	import { link } from '$lib/router.svelte.js';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { addToast } from '$lib/toast.svelte.js';

	const shelfOrder = ['unread', 'legend', 'love', 'favorite', 'like', 'hold', 'deleted'];

	let bookshelves = $state(null);
	let duplicates = $state(null);

	async function loadBookshelves() {
		bookshelves = await fetcher(`${config.path.api}/bookshelves`);
	}

	async function loadDuplicates() {
		duplicates = await fetcher(`${config.path.api}/duplicates`);
	}

	let registering = $state(false);

	async function runRegister() {
		registering = true;
		try {
			const result = await fetcher(`${config.path.api}/register`, { method: 'POST' });
			const msgs = [];
			if (result.registered.length) msgs.push(`${result.registered.length} registered`);
			if (result.duplicated.length) msgs.push(`${result.duplicated.length} duplicated`);
			if (result.errors.length) msgs.push(`${result.errors.length} errors`);
			addToast(msgs.length ? msgs.join(', ') : 'No new comics');
			loadBookshelves();
			loadDuplicates();
		} catch {
			addToast('Register failed');
		} finally {
			registering = false;
		}
	}

	async function deleteDuplicate(name) {
		await fetcher(`${config.path.api}/duplicates/${encodeURIComponent(name)}`, { method: 'DELETE' });
		addToast('Deleted');
		loadDuplicates();
	}

	$effect(() => {
		loadBookshelves();
		loadDuplicates();
		document.title = 'comic-server';
	});
</script>

<main id="dashboard">
	{#if duplicates?.length}
		<section class="notifications">
			<h2>Notifications</h2>
			<div class="card">
				<p class="summary">{duplicates.length} duplicate(s) found</p>
				<ul class="duplicate-list">
					{#each duplicates as dup}
						<li>
							<span class="name">{dup.name}</span>
							{#if dup.existingId}
								<a href="{link('/comics/' + dup.existingId)}">view #{dup.existingId}</a>
								<span class="shelf">({dup.existingBookshelf})</span>
							{/if}
							<button onclick={() => deleteDuplicate(dup.name)}>delete</button>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}

	<section class="actions">
		<button onclick={runRegister} disabled={registering}>
			{registering ? 'Registering...' : 'Register Now'}
		</button>
	</section>

	<section class="shelves">
		<h2>Bookshelves</h2>
		{#if !bookshelves}
			loading...
		{:else}
			<ul class="shelf-list">
				{#each shelfOrder as name}
					{@const count = bookshelves[name] || 0}
					<li>
						<a href="{link('/bookshelves/' + name)}">
							<span class="shelf-name">{name}</span>
							<span class="shelf-count">{count.toLocaleString()}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style lang="sass">
#dashboard
	padding: 15px
	max-width: 800px

	h2
		margin-top: 12px
		margin-bottom: 8px

	.notifications
		.card
			padding: 12px
			border-radius: 8px
			background: rgba(255, 255, 255, 0.08)

		.summary
			margin: 0 0 8px
			font-weight: bold

		.duplicate-list
			li
				display: flex
				align-items: center
				gap: 8px
				padding: 4px 0

			.name
				flex: 1
				overflow: hidden
				text-overflow: ellipsis
				white-space: nowrap

			.shelf
				opacity: 0.6
				font-size: 0.85em

			button
				padding: 2px 8px
				border: 1px solid rgba(255, 255, 255, 0.3)
				border-radius: 4px
				background: transparent
				color: rgba(255, 255, 255, 0.7)
				cursor: pointer
				font-size: 0.85em

				&:hover
					background: rgba(255, 255, 255, 0.1)

	.actions
		margin: 12px 0

		button
			padding: 6px 16px
			border: 1px solid rgba(255, 255, 255, 0.3)
			border-radius: 4px
			background: transparent
			color: rgba(255, 255, 255, 0.85)
			cursor: pointer

			&:hover:not(:disabled)
				background: rgba(255, 255, 255, 0.1)

			&:disabled
				opacity: 0.5
				cursor: default

	.shelf-list
		li
			a
				display: flex
				justify-content: space-between
				padding: 8px 12px
				border-radius: 4px

				&:hover
					background: rgba(255, 255, 255, 0.08)

			.shelf-count
				opacity: 0.7
</style>
