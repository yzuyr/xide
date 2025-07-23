<script lang="ts">
	import { shortcut } from '@svelte-put/shortcut';
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
	import { open } from '@tauri-apps/plugin-dialog';
	import EditorTab from '$lib/components/editor-tab.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { style } from 'svelte-body';
	import { appStore } from '$lib/store/app.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { emit } from '@tauri-apps/api/event';
	import { goto } from '$app/navigation';
	import Chat from '$lib/components/chat.svelte';
	import { editorStore } from '$lib/store/editor.svelte';

	const currentRowId = $derived(page.params.rowId);
	let innerWidth = $state(0);
	const tabIds = $derived(workspaceStore.findRowById(currentRowId)?.tabIds ?? []);
	const tabs = $derived(tabIds.map((tabId) => workspaceStore.findTabById(tabId)));
	const bodyWidth = $derived(tabIds.length === 1 ? innerWidth : tabIds.length * innerWidth * 0.75);
	const bodyStyle = $derived(tabIds.length > 0 ? `width: ${bodyWidth}px;` : 'width: 100%;');

	async function openFilePicker() {
		const files = await open({
			multiple: true,
			directory: false
		});
		if (!files) return;
		for (const filePath of files) {
			workspaceStore.addTab({ rowId: currentRowId, filePath });
		}
	}

	$effect(() => {
		if (tabIds.length === 0) {
			goto('/');
			return;
		}
	});

	onMount(() => {
		workspaceStore.setChatVisible(false);
		workspaceStore.setCurrentRowId(currentRowId);
		if (!workspaceStore.currentTabId) {
			workspaceStore.setCurrentTabId(tabIds[0]);
		}
		emit('focus-tab', { id: workspaceStore.currentTabId });
		editorStore.loadEditor();
		editorStore.setupCopilot();
	});
</script>

<svelte:body use:style={bodyStyle} />

<svelte:window
	bind:innerWidth
	use:shortcut={{
		trigger: [
			{
				key: 'o',
				modifier: ['ctrl', 'meta'],
				callback: openFilePicker,
				preventDefault: true
			},
			{
				key: 'k',
				modifier: ['ctrl'],
				callback: () => workspaceStore.nextRow({ rowId: currentRowId }),
				preventDefault: true
			},
			{
				key: 'i',
				modifier: ['ctrl'],
				callback: () => workspaceStore.prevRow({ rowId: currentRowId }),
				preventDefault: true
			},
			{
				key: 'k',
				modifier: ['meta'],
				callback: () => appStore.toggleCommandMenu(),
				preventDefault: true
			},
			{
				key: 'l',
				modifier: ['meta'],
				callback: () => goto('/'),
				preventDefault: true
			}
		]
	}}
/>

<PaneGroup direction="horizontal" class="flex-1 mt-8 bg-base-200 px-1 pb-1">
	{#each tabs ?? [] as tab, index (tab?.id)}
		{#if tab}
			<Pane defaultSize={50} minSize={25} class="h-full flex">
				{#if editorStore.monacoReady}
					<EditorTab {tab} />
				{/if}
			</Pane>
			{#if workspaceStore.chatVisible || index < tabIds.length - 1}
				<PaneResizer class="bg-base-200 w-1 h-full"></PaneResizer>
			{/if}
		{/if}
	{/each}
	{#if workspaceStore.chatVisible}
		<Pane defaultSize={25} minSize={25} class="h-full flex">
			<Chat />
		</Pane>
	{/if}
</PaneGroup>
