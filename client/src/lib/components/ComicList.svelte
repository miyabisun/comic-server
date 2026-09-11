<script>
	import { tick, untrack } from 'svelte';
	import { format, parseISO } from 'date-fns';
	import { link, navigate } from '$lib/router.svelte.js';
	import { brandPath } from '$lib/brand.js';
	import { commandKey, createDeleteSequence, reconcileCursor, ratingForKey } from '$lib/keyboard.js';
	import { ratingLevels } from '$lib/levels.js';
	import fetcher from '$lib/fetcher.js';
	import { updateComic, deleteComic } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';
	import { reloadOnFocus } from '$lib/reload-on-focus.svelte.js';
	import ReviewStars from './ReviewStars.svelte';
	import ComicDialog from './ComicDialog.svelte';
	import Icon from './Icon.svelte';

	let { url, title, scope = title, sortable = false, bulkRating = false, bulkDelete = false, busy = $bindable(false), children } = $props();
	let comics = $state(null);
	let sortKey = $state(null);
	let cursor = $state(null);
	let loading = $state(false);
	let loadFailed = $state(false);
	let error = $state('');
	let pending = $state(null);
	let help = $state(false);
	let table = $state(null);
	let request = 0;
	let entryPath = '';
	const sequence = createDeleteSequence();
	let sorted = $derived(!comics ? [] : !sortKey ? comics : [...comics].sort((a, b) =>
		a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : (a.title ?? '').localeCompare(b.title ?? '')));
	let selected = $derived(sorted.find((comic) => comic.id === cursor));
	let targets = $derived(sorted.filter((comic) => comic.deleted_at == null));
	let locked = $derived(busy || loading || loadFailed);

	function savePosition() {
		if (!comics || loading || entryPath !== location.pathname + location.search) return;
		history.replaceState({ ...history.state, comicCursor: {
			url, id: cursor, index: sorted.findIndex((comic) => comic.id === cursor), scrollY: window.scrollY, sortKey
		} }, '');
	}

	async function reveal(focus = true) {
		await tick();
		if (focus) table?.focus({ preventScroll: true });
		document.getElementById(`comic-row-${cursor}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
		savePosition();
	}

	async function load(endpoint, reset = false, excludedId = null) {
		const current = ++request;
		const saved = reset ? (history.state?.comicCursor?.url === endpoint ? history.state.comicCursor : {}) : {
			id: cursor, index: sorted.findIndex((comic) => comic.id === cursor), scrollY: window.scrollY, sortKey
		};
		if (reset) { entryPath = location.pathname + location.search; comics = null; pending = null; help = false; sortKey = saved.sortKey ?? null; sequence.reset(); }
		loading = true;
		loadFailed = false;
		error = '';
		try {
			const result = await fetcher(endpoint);
			if (current !== request) return false;
			comics = result;
			await tick();
			if (current !== request) return false;
			cursor = reconcileCursor(sorted.filter((comic) => comic.id !== excludedId), saved.id, saved.index ?? 0);
			await tick();
			window.scrollTo({ top: saved.scrollY ?? 0, behavior: 'instant' });
			// Old entries stored a table offset; retain their ID and reveal it instead.
			if (saved.scrollY == null && saved.id != null) await reveal(false);
			if (document.activeElement === document.body || document.activeElement?.closest('header')) table?.focus({ preventScroll: true });
			return true;
		} catch (e) {
			if (current === request) { error = `一覧を取得できませんでした: ${e.message}`; loadFailed = true; }
			return false;
		} finally {
			if (current === request) { loading = false; savePosition(); }
		}
	}

	$effect(() => {
		const endpoint = url;
		untrack(() => load(endpoint, true));
		return () => { request++; sequence.reset(); };
	});
	$effect(() => { document.title = title; });
	reloadOnFocus(() => { if (!busy && !pending && !help) load(url); });

	function pick(id) {
		if (locked) return;
		sequence.reset();
		cursor = id;
		savePosition();
	}

	function focusRow(e) {
		sequence.reset();
		const row = e.target.closest('[data-comic-id]');
		if (row) pick(Number(row.dataset.comicId));
	}

	function changeSort(key) {
		if (locked || pending) return;
		sequence.reset();
		sortKey = key;
		reveal(false);
	}

	async function rate(comic, shelf) {
		if (locked || pending || !comic || comic.deleted_at) return;
		pick(comic.id);
		if (comic.bookshelf === shelf) return;
		busy = true;
		error = '';
		try {
			await updateComic(comic.id, { bookshelf: shelf });
			if (await load(url)) { addToast('Updated'); await reveal(); }
		} catch (e) { error = `評価を変更できませんでした: ${e.message}`; }
		finally { busy = false; }
	}

	function ask(kind, items, shelf = null) {
		if (locked || pending || !items.length) return;
		sequence.reset();
		error = '';
		pending = { kind, items: items.map((comic) => ({ ...comic })), shelf, scope };
	}

	async function closeDialog() {
		if (busy) return;
		pending = null;
		help = false;
		sequence.reset();
		await tick();
		table?.focus({ preventScroll: true });
	}

	async function confirm() {
		if (busy || !pending) return;
		const action = pending;
		busy = true;
		error = '';
		const results = await Promise.allSettled(action.items.map((comic) => action.kind === 'bulk-rating'
			? updateComic(comic.id, { bookshelf: action.shelf }) : deleteComic(comic.id)));
		const failed = results.filter((result) => result.status === 'rejected');
		if (action.kind === 'delete' && failed.length) {
			error = `削除できませんでした: ${failed[0].reason.message}`;
		} else {
			pending = null;
			const loaded = await load(url, false, action.kind === 'delete' ? action.items[0].id : null);
			if (failed.length) error = `${action.items.length}件中${failed.length}件の更新に失敗しました。`;
			else if (loaded) addToast(action.kind === 'bulk-rating' ? 'Updated all' : 'Deleted');
			if (loaded) await reveal();
		}
		busy = false;
	}

	function keydown(e) {
		let key = commandKey(e);
		if (locked || pending || help || document.querySelector('dialog[open]')) key = null;
		if (e.target.closest?.('a, button') && !e.target.closest?.('[data-comic-id]') && !['j', 'k', '?'].includes(key)) key = null;
		const deleting = sequence.press(key, cursor, e.repeat);
		if (!key) return;
		if (key === '?' && !e.repeat) { e.preventDefault(); help = true; return; }
		if (['j', 'k'].includes(key)) {
			e.preventDefault();
			const index = sorted.findIndex((comic) => comic.id === cursor);
			cursor = sorted[Math.max(0, Math.min(sorted.length - 1, index + (key === 'j' ? 1 : -1)))]?.id ?? null;
			reveal();
			return;
		}
		if (e.repeat) {
			if (ratingForKey(key) || ['d', 'Enter', ' '].includes(key)) e.preventDefault();
			return;
		}
		if (key === 'Backspace') { e.preventDefault(); navigate('/'); return; }
		if (!selected) return;
		if (key === 'b') {
			e.preventDefault();
			const path = brandPath(selected.brand, 'exact');
			if (path) navigate(path); else addToast('ブランドが未設定です');
		} else if (['Enter', ' '].includes(key) && !e.target.closest?.('a, button')) {
			e.preventDefault();
			if (!selected.deleted_at) { savePosition(); navigate('/comics/' + selected.id); }
		} else if (ratingForKey(key)) {
			e.preventDefault(); rate(selected, ratingForKey(key));
		} else if (key === 'd') {
			e.preventDefault();
			if (deleting && !selected.deleted_at) ask('delete', [selected]);
		}
	}
</script>

<svelte:window onkeydown={keydown} onblur={() => sequence.reset()} onscroll={savePosition} onpagehide={savePosition} />

<main id="bookshelf">
	<div class="list-tools">
		<h2>{title}</h2>
		<button type="button" onclick={() => { sequence.reset(); help = true; }}>操作一覧 (?)</button>
		{@render children?.()}
	</div>
	<span id="cursor-status" class="sr-only" aria-live="polite">{selected ? `操作対象: ${selected.title || selected.file}${selected.deleted_at ? '（削除済み）' : ''}` : '操作対象なし'}</span>
	{#if error && !pending}<p role="alert">{error}</p>{/if}
	{#if loadFailed}<button type="button" onclick={() => load(url)}>一覧を再取得</button>{/if}
	{#if comics}
		<div class="table-scroll">
			<table class="comics" role="grid" aria-label="コミック一覧" aria-describedby="cursor-status" aria-activedescendant={cursor == null ? undefined : `comic-row-${cursor}`} aria-busy={locked} tabindex="0" bind:this={table} onfocusin={focusRow} onpointerdown={focusRow}>
				<thead><tr>
					<th class="brand">{#if sortable}<button type="button" onclick={() => changeSort('brand')}>brand</button>{:else}brand{/if}</th>
					<th class="title">title</th>
					<th class="date">{#if sortable}<button type="button" onclick={() => changeSort(null)}>registered</button>{:else}registered{/if}</th>
					<th class="review">
						{#if bulkRating}
							<div class="stars">{#each ratingLevels as shelf}<button type="button" disabled={locked || !targets.length} aria-label={`表示中の${targets.length}件を${shelf}に評価`} onclick={() => ask('bulk-rating', targets, shelf)}>★</button>{/each}</div>
						{:else}review{/if}
					</th>
					<th class="delete">{#if bulkDelete}<button type="button" class="icon-button" disabled={locked || !targets.length} aria-label="すべて削除" onclick={() => ask('bulk-delete', targets)}><Icon name="trash" /></button>{/if}</th>
				</tr></thead>
				<tbody>
					{#each sorted as comic (comic.id)}
						{@const active = cursor === comic.id}
						<tr id={`comic-row-${comic.id}`} data-comic-id={comic.id} class:focused={active} class:deleted={comic.deleted_at != null} aria-selected={active}>
							<td class="brand" title={comic.brand ?? ''}>{#if brandPath(comic.brand)}<a tabindex={active ? 0 : -1} href={link(brandPath(comic.brand))}>{comic.brand}</a>{/if}</td>
							<td class="title" title={comic.title || comic.file}>{#if comic.deleted_at}{comic.title || comic.file}{:else}<a tabindex={active ? 0 : -1} href={link('/comics/' + comic.id)}>{comic.title || comic.file}</a>{/if}</td>
							<td class="date">{format(parseISO(comic.created_at), 'yyyy-MM-dd HH:mm:ss')}</td>
							<td class="review">{#if !comic.deleted_at}<ReviewStars bookshelf={comic.bookshelf} tabindex={active ? 0 : -1} disabled={locked} onchange={(shelf) => rate(comic, shelf)} />{/if}</td>
							<td class="delete">{#if !comic.deleted_at}<button type="button" class="icon-button" tabindex={active ? 0 : -1} disabled={locked} aria-label={`「${comic.title || comic.file}」を削除`} onclick={() => ask('delete', [comic])}><Icon name="trash" /></button>{/if}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if !sorted.length}<p>作品はありません。</p>{/if}
	{:else if loading}<p role="status">loading...</p>{/if}
</main>

{#if help}<ComicDialog title="一覧のショートカット" help="list" onclose={closeDialog} />{/if}
{#if pending}
	<ComicDialog title={pending.kind === 'delete' ? 'コミックを削除' : pending.kind === 'bulk-rating' ? '一括評価の確認' : '一括削除の確認'}
		message={pending.kind === 'delete' ? `「${pending.items[0].title || pending.items[0].file}」を削除しますか？` : `${pending.scope}の${pending.items.length}件を${pending.kind === 'bulk-rating' ? pending.shelf + 'に分類' : '削除'}します。`}
		keyboardConfirm={pending.kind === 'delete'} confirmLabel={pending.kind === 'bulk-rating' ? '一括評価を確定' : pending.kind === 'bulk-delete' ? '一括削除を確定' : '削除する (y)'}
		{busy} {error} onclose={closeDialog} onconfirm={confirm} />
{/if}

<style lang="sass">
main
	padding: var(--sp-4)
	min-width: 0
	h2
		font-size: var(--fs-xl)
		margin: 0
		flex: 1 1 auto
		overflow-wrap: anywhere
	.list-tools
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: var(--sp-2)
		margin-bottom: var(--sp-2)
	[role="alert"]
		color: var(--c-danger)
	button
		min-height: 36px
		padding: var(--sp-1) var(--sp-2)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)
		background: transparent
		color: var(--c-text)
		cursor: pointer
		&:disabled
			opacity: 0.5
	table
		min-width: 680px
		width: 100%
		table-layout: fixed
		border-collapse: separate
		border-spacing: 0
		th, td
			padding: var(--sp-1)
			line-height: 1.5
			white-space: nowrap
			overflow: hidden
			text-overflow: ellipsis
		th
			font-size: var(--fs-sm)
			border-bottom: 1px solid var(--c-border)
			text-align: left
		button
			min-height: 24px
			min-width: 24px
			padding: 0
			border: 0
		.focused
			background: var(--c-overlay-2)
		tbody tr:not(.focused):hover
			background: var(--c-overlay-1)
		.deleted
			color: var(--c-text-muted)
		.brand
			width: 20%
		.date
			width: 168px
		.review
			width: 128px
		.delete
			width: 32px
		.stars, .icon-button
			display: flex
			align-items: center
			justify-content: center
</style>
