<script>
	import { navigate } from '$lib/router.svelte.js';
	import { brandPath } from '$lib/brand.js';
	import config from '$lib/config.js';
	import ComicList from '$lib/components/ComicList.svelte';
	let { params } = $props();
	let name = $derived(params.name);
	let match = $derived(params.match ?? 'fuzzy');
	let busy = $state(false);
</script>

<ComicList url={`${config.path.api}/brands/${encodeURIComponent(name)}?match=${encodeURIComponent(match)}`} title={`brand: ${name}`} scope={`${match === 'exact' ? '完全一致' : '曖昧検索'}: ${name}`} bulkRating bulkDelete bind:busy>
	<label class="match-mode">
		ブランド検索
		<select aria-label="ブランド検索モード" value={match} disabled={busy || !name?.trim()}
			onchange={(e) => navigate(brandPath(name, e.currentTarget.value))}>
			<option value="fuzzy">曖昧検索</option>
			<option value="exact">完全一致</option>
		</select>
	</label>
</ComicList>

<style lang="sass">
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
</style>
