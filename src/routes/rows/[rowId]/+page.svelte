<script lang="ts">
	import { shortcut } from '@svelte-put/shortcut';
	import { open } from '@tauri-apps/plugin-dialog';
	import EditorTab from '$lib/components/editor-tab.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { appStore } from '$lib/store/app.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { emit } from '@tauri-apps/api/event';
	import { goto } from '$app/navigation';
	import Chat from '$lib/components/chat.svelte';
	import { editorStore } from '$lib/store/editor.svelte';
	import { Virtualizer } from 'virtua/svelte';
	import clsx from 'clsx';

	const currentRowId = $derived(page.params.rowId);
	let innerWidth = $state(0);
	const tabIds = $derived(workspaceStore.findRowById(currentRowId)?.tabIds ?? []);
	const tabs = $derived(
		tabIds.map((tabId) => workspaceStore.findTabById(tabId)).filter((tab) => tab !== undefined)
	);
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
		editorStore.loadEditor().then(() => {
			setTimeout(() => {
				emit('focus-tab', { id: workspaceStore.currentTabId });
			}, 100);
		});
		editorStore.setupCopilot();
	});
</script>

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
			},
			{
				key: 'w',
				modifier: ['meta'],
				callback: () => {
					if (!workspaceStore.currentTabId) return;
					if (tabs.length > 0) {
						return workspaceStore.removeTab({ tabId: workspaceStore.currentTabId });
					}
					return goto('/');
				},
				preventDefault: true
			}
		]
	}}
/>

<div class="flex-1 flex mt-8 px-1 pb-1 bg-base-200 overflow-x-auto">
	{#if editorStore.monacoReady}
		<Virtualizer data={tabs} getKey={(tab, index) => tab?.id ?? index} horizontal>
			{#snippet children(tab)}
				<div
					class={clsx('h-full flex flex-col scroll-mx-2', tabs.length > 1 && 'mr-1')}
					data-tab-id={tab.id}
					style={tabs.length > 1
						? `width: calc(${innerWidth * 0.75}px);`
						: `width: calc(${innerWidth}px - 0.5rem);`}
				>
					<EditorTab {tab} />
				</div>
			{/snippet}
		</Virtualizer>
	{/if}
	{#if workspaceStore.chatVisible}
		<Chat />
	{/if}
</div>
