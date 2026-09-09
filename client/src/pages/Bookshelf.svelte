<script>
	import config from '$lib/config.js';
	import ComicList from '$lib/components/ComicList.svelte';
	let { params } = $props();
	let name = $derived(params.name);
</script>

<ComicList url={`${config.path.api}/bookshelves/${encodeURIComponent(name)}`} title={`bookshelf: ${name}`} scope={`本棚 ${name}`} sortable bulkDelete={name === 'unread' || name === 'hold'} />
