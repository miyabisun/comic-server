<script>
	import { link } from '$lib/router.svelte.js';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { addToast } from '$lib/toast.svelte.js';
	import Icon from '$lib/components/Icon.svelte';

	const shelfOrder = ['unread', 'legend', 'love', 'favorite', 'like', 'hold', 'deleted'];

	let bookshelves = $state(null);
	let duplicates = $state(null);
	let comparing = $state(null);

	async function loadBookshelves() {
		bookshelves = await fetcher(`${config.path.api}/bookshelves`);
	}

	async function loadDuplicates() {
		duplicates = await fetcher(`${config.path.api}/duplicates`);
	}

	async function compareDuplicate(name) {
		comparing = await fetcher(`${config.path.api}/duplicates/${encodeURIComponent(name)}/compare`);
	}

	async function keepExisting(name) {
		await fetcher(`${config.path.api}/duplicates/${encodeURIComponent(name)}`, { method: 'DELETE' });
		addToast('Kept existing, duplicate deleted');
		comparing = null;
		loadDuplicates();
	}

	async function keepDuplicate(name) {
		await fetcher(`${config.path.api}/duplicates/${encodeURIComponent(name)}/replace`, { method: 'POST' });
		addToast('Replaced with duplicate');
		comparing = null;
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
								<a href="{link('/comics/' + dup.existingId)}">#{dup.existingId}</a>
								<span class="shelf">({dup.existingBookshelf})</span>
							{/if}
							<button onclick={() => compareDuplicate(dup.name)}>compare</button>
						</li>
					{/each}
				</ul>
			</div>

			{#if comparing}
				<div class="compare-panel">
					<div class="compare-header">
						<h3>Compare</h3>
						<button class="close" aria-label="閉じる" onclick={() => comparing = null}>
							<Icon name="x" />
						</button>
					</div>
					<div class="compare-grid">
						<div class="col">
							<h4>Existing</h4>
							{#if comparing.existing}
								<dl>
									<dt>file</dt><dd class="mono">{comparing.existing.file}</dd>
									<dt>bookshelf</dt><dd>{comparing.existing.bookshelf}</dd>
									<dt>images</dt><dd>{comparing.existing.imageCount}</dd>
									<dt>dir exists</dt><dd class={comparing.existing.dirExists ? '' : 'warn'}>{comparing.existing.dirExists ? 'yes' : 'no'}</dd>
								</dl>
								{#if comparing.existing.dirExists}
									<a class="view-link" href="{link('/comics/' + comparing.existing.id)}">View comic</a>
								{/if}
							{:else}
								<p class="warn">No matching record in DB</p>
							{/if}
						</div>
						<div class="col">
							<h4>Duplicate</h4>
							<dl>
								<dt>file</dt><dd class="mono">{comparing.duplicate.name}</dd>
								<dt>images</dt><dd>{comparing.duplicate.imageCount}</dd>
							</dl>
						</div>
					</div>
					<div class="compare-actions">
						{#if comparing.existing}
							<button onclick={() => keepExisting(comparing.duplicate.name)}>Keep existing</button>
							<button class="primary" onclick={() => keepDuplicate(comparing.duplicate.name)}>Keep duplicate</button>
						{:else}
							<button onclick={() => keepDuplicate(comparing.duplicate.name)}>Register as new</button>
						{/if}
					</div>
				</div>
			{/if}
		</section>
	{/if}

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
			border-radius: var(--radius-md)
			background: var(--c-surface)
			border: 1px solid var(--c-border)

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
				color: var(--c-text-sub)
				font-size: var(--fs-sm)

			button
				padding: 2px 8px
				border: 1px solid var(--c-border)
				border-radius: var(--radius-sm)
				background: transparent
				color: var(--c-text-sub)
				cursor: pointer
				font-size: var(--fs-sm)

				&:hover
					background: var(--c-overlay-2)

		.compare-panel
			margin-top: 12px
			padding: 12px
			border-radius: var(--radius-md)
			background: var(--c-surface)
			border: 1px solid var(--c-border)

			.compare-header
				display: flex
				justify-content: space-between
				align-items: center
				margin-bottom: 8px

				h3
					margin: 0

				.close
					display: inline-flex
					align-items: center
					justify-content: center
					width: 36px
					height: 36px
					padding: 0
					border: none
					border-radius: var(--radius-sm)
					background: transparent
					color: var(--c-text-sub)
					cursor: pointer

					&:hover
						color: var(--c-text)

		.compare-grid
			display: grid
			grid-template-columns: 1fr 1fr
			gap: 16px

			h4
				margin: 0 0 6px
				font-size: var(--fs-sm)
				color: var(--c-text-sub)

			dl
				margin: 0
				font-size: var(--fs-sm)

				dt
					font-weight: bold
					color: var(--c-text-sub)
					margin-top: 4px

				dd
					margin: 0 0 2px
					word-break: break-all

			.mono
				font-family: monospace
				font-size: var(--fs-xs)

			.warn
				color: var(--c-danger)

			.view-link
				display: inline-block
				margin-top: 6px
				font-size: var(--fs-sm)

		.compare-actions
			display: flex
			gap: 8px
			margin-top: 12px

			button
				padding: 4px 12px
				border: 1px solid var(--c-border)
				border-radius: var(--radius-sm)
				background: transparent
				color: var(--c-text-sub)
				cursor: pointer
				font-size: var(--fs-sm)

				&:hover
					background: var(--c-overlay-2)

				&.primary
					background: var(--c-accent)
					border-color: var(--c-accent)
					color: var(--c-on-accent)

					&:hover
						background: var(--c-accent-hover)

	.shelf-list
		li
			a
				display: flex
				justify-content: space-between
				padding: 8px 12px
				border-radius: var(--radius-sm)

				&:hover
					background: var(--c-overlay-2)

			.shelf-count
				color: var(--c-text-sub)
</style>
