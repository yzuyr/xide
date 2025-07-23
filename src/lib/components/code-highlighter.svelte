<script lang="ts">
	import { appStore } from '$lib/store/app.svelte';
	import { configStore } from '$lib/store/config.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { type Highlighter } from 'shiki';

	const { highlighter, code, path }: { highlighter: Highlighter; code: string; path: string } =
		$props();

	const highlightedCode = $derived(
		createQuery({
			queryKey: ['highlightedCode', appStore.theme, path],
			queryFn: highlightCode
		})
	);

	async function highlightCode() {
		return highlighter?.codeToHtml(code, {
			lang: 'javascript',
			theme:
				appStore.theme === 'dark'
					? configStore.config.editor.dark_theme
					: configStore.config.editor.light_theme
		});
	}
</script>

<div class="flex-1 flex flex-col overflow-auto text-xs relative">
	{#if $highlightedCode.isLoading}
		<p>Loading</p>
	{:else}
		<div class="absolute inset-0 p-2 font-[Geist_Mono] bg-base-100 dark:bg-[#17191e]">
			{@html $highlightedCode.data}
		</div>
	{/if}
</div>
