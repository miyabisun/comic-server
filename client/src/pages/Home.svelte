<script>
	import { link } from '$lib/router.svelte.js';
	import fetcher from '$lib/fetcher.js';
	import config from '$lib/config.js';
	import { addToast } from '$lib/toast.svelte.js';

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
		comparing = null;
		loadDuplicates();
	}

	async function compareDuplicate(name) {
		comparing = await fetcher(`${config.path.api}/duplicates/${encodeURIComponent(name)}/compare`);
	}

	async function replaceDuplicate(name) {
		await fetcher(`${config.path.api}/duplicates/${encodeURIComponent(name)}/replace`, { method: 'POST' });
		addToast('Replaced');
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
							<button onclick={() => deleteDuplicate(dup.name)}>delete</button>
						</li>
					{/each}
				</ul>
			</div>

			{#if comparing}
				<div class="compare-panel">
					<h3>Compare</h3>
					<div class="compare-grid">
						<div class="col">
							<h4>Existing (DB)</h4>
							{#if comparing.existing}
								<dl>
									<dt>id</dt><dd>{comparing.existing.id}</dd>
									<dt>file</dt><dd class="mono">{comparing.existing.file}</dd>
									<dt>bookshelf</dt><dd>{comparing.existing.bookshelf}</dd>
									<dt>title</dt><dd>{comparing.existing.title}</dd>
									<dt>brand</dt><dd>{comparing.existing.brand || '-'}</dd>
									<dt>genre</dt><dd>{comparing.existing.genre || '-'}</dd>
									<dt>original</dt><dd>{comparing.existing.original || '-'}</dd>
								</dl>
							{:else}
								<p class="warn">No matching record in DB</p>
							{/if}
						</div>
						<div class="col">
							<h4>Duplicate (new)</h4>
							<dl>
								<dt>file (raw)</dt><dd class="mono">{comparing.duplicate.name}</dd>
								<dt>file (sanitized)</dt><dd class="mono">{comparing.duplicate.sanitizedName}</dd>
								<dt>title</dt><dd>{comparing.duplicate.parsed.title}</dd>
								<dt>brand</dt><dd>{comparing.duplicate.parsed.brand || '-'}</dd>
								<dt>genre</dt><dd>{comparing.duplicate.parsed.genre || '-'}</dd>
								<dt>original</dt><dd>{comparing.duplicate.parsed.original || '-'}</dd>
							</dl>
						</div>
					</div>
					<div class="compare-actions">
						{#if comparing.existing}
							<button class="primary" onclick={() => replaceDuplicate(comparing.duplicate.name)}>
								Replace existing with duplicate
							</button>
						{/if}
						<button onclick={() => deleteDuplicate(comparing.duplicate.name)}>Delete duplicate</button>
						<button onclick={() => comparing = null}>Cancel</button>
					</div>
				</div>
			{/if}
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

		.compare-panel
			margin-top: 12px
			padding: 12px
			border-radius: 8px
			background: rgba(255, 255, 255, 0.06)
			border: 1px solid rgba(255, 255, 255, 0.15)

			h3
				margin: 0 0 8px

			h4
				margin: 0 0 6px
				font-size: 0.9em
				opacity: 0.7

		.compare-grid
			display: grid
			grid-template-columns: 1fr 1fr
			gap: 16px

			dl
				margin: 0
				font-size: 0.85em

				dt
					font-weight: bold
					opacity: 0.6
					margin-top: 4px

				dd
					margin: 0 0 2px
					word-break: break-all

			.mono
				font-family: monospace
				font-size: 0.8em

			.warn
				color: #f90
				font-size: 0.85em

		.compare-actions
			display: flex
			gap: 8px
			margin-top: 12px

			button
				padding: 4px 12px
				border: 1px solid rgba(255, 255, 255, 0.3)
				border-radius: 4px
				background: transparent
				color: rgba(255, 255, 255, 0.7)
				cursor: pointer
				font-size: 0.85em

				&:hover
					background: rgba(255, 255, 255, 0.1)

				&.primary
					background: rgba(60, 130, 240, 0.3)
					border-color: rgba(60, 130, 240, 0.5)

					&:hover
						background: rgba(60, 130, 240, 0.5)

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
