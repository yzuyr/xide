<script lang="ts">
	import { EXTENSION_TO_LANG } from '$lib/const';
	import { appStore } from '$lib/store/app.svelte';
	import { configStore } from '$lib/store/config.svelte';

	const { code, path }: { code: string; path: string } = $props();

	const lang = $derived(EXTENSION_TO_LANG[path.split('.').pop() ?? 'js']);

	const highlightedCode = $derived.by(() => {
		if (!code) return '';
		if (!appStore.highlighter) return '';
		return appStore.highlighter.codeToHtml(code, {
			lang,
			theme:
				appStore.theme === 'dark'
					? configStore.config.editor.dark_theme
					: configStore.config.editor.light_theme
		});
	});
</script>

<div class="flex-1 flex flex-col overflow-auto text-xs relative">
	{#if highlightedCode}
		<div class="absolute inset-0 p-2 font-[Geist_Mono] bg-base-100 dark:bg-[#17191e]">
			{@html highlightedCode}
		</div>
	{/if}
</div>
