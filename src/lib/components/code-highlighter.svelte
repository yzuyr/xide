<script lang="ts">
	import { EXTENSION_TO_LANG } from '$lib/const';
	import { appStore } from '$lib/store/app.svelte';
	import { configStore } from '$lib/store/config.svelte';
	import type { Range } from '$lib/store/editor.svelte';

	const { code, path, range }: { code: string; path: string; range?: Range } = $props();

	const lang = $derived(EXTENSION_TO_LANG[path.split('.').pop() ?? 'js']);

	const highlightedCode = $derived.by(() => {
		if (!code) return '';
		if (!appStore.highlighter) return '';
		return appStore.highlighter.codeToHtml(code, {
			lang,
			theme:
				appStore.theme === 'dark'
					? configStore.config.editor.dark_theme
					: configStore.config.editor.light_theme,
			decorations: range
				? [
						{
							start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
							end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
							properties: { class: 'range bg-primary rounded' }
						}
					]
				: []
		});
	});

	$effect(() => {
		if (!range) return;
		const rangeElement = document.querySelector('.range');
		if (!rangeElement) return;
		rangeElement.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest'
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

<style>
	:global(code) {
		counter-reset: step;
		counter-increment: step 0;
	}

	:global(code .line::before) {
		content: counter(step);
		counter-increment: step;
		width: 1rem;
		margin-right: 1.5rem;
		display: inline-block;
		text-align: right;
		color: rgba(115, 138, 148, 0.4);
	}
</style>
