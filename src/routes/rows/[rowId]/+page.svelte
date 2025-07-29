<script lang="ts">
	import { shortcut } from '@svelte-put/shortcut';
	import { open } from '@tauri-apps/plugin-dialog';
	import EditorTab from '$lib/components/editor-tab.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { appStore } from '$lib/store/app.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { emit } from '@tauri-apps/api/event';
	import Chat from '$lib/components/chat.svelte';
	import { editorStore } from '$lib/store/editor.svelte';
	import { Virtualizer } from 'virtua/svelte';
	import clsx from 'clsx';
	import { SvelteSet } from 'svelte/reactivity';
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
	import { ScrollArea } from 'bits-ui';
	import TabExplorer from '$lib/components/tab-explorer.svelte';
	import { watch } from 'runed';

	const currentRowId = $derived(page.params.rowId);
	const currentTabId = $derived(page.url.searchParams.get('tabId'));
	let innerWidth = $state(0);
	const tabIds = $derived(
		workspaceStore.findRowById(currentRowId)?.tabIds ?? new SvelteSet<string>()
	);
	const tabs = $derived(
		Array.from(tabIds)
			.map((tabId) => workspaceStore.findTabById(tabId))
			.filter((tab) => tab !== undefined)
	);
	async function openFilePicker() {
		if (!workspaceStore.rootDir) return;
		const files = await open({
			multiple: true,
			directory: false
		});
		if (!files) return;
		for (const filePath of files) {
			const projectFile = filePath.includes(workspaceStore.rootDir);
			if (projectFile) {
				const shortPath = filePath.replace(workspaceStore.rootDir, '').substring(1);
				workspaceStore.addTab({ rowId: currentRowId, filePath: shortPath });
			} else {
				workspaceStore.addTab({ rowId: currentRowId, filePath, external: true });
			}
		}
	}

	function getBreakpointValue<T extends number | string>({
		sm,
		md,
		lg,
		xl
	}: {
		sm: T;
		md: T;
		lg: T;
		xl: T;
	}): T {
		if (innerWidth < 768) return sm;
		if (innerWidth < 1024) return md;
		if (innerWidth < 1280) return lg;
		return xl;
	}

	watch(
		() => currentTabId,
		(tabId) => {
			if (!tabId) return;
			const tab = workspaceStore.findTabById(tabId);
			if (!tab) return;
			workspaceStore.setCurrentRowId(tab.rowId);
			workspaceStore.setCurrentTabId(tabId);
			emit('focus-tab', { id: tabId });
		}
	);

	watch(
		() => tabs.length,
		(length) => {
			if (length === 0) {
				workspaceStore.setCurrentTabId(undefined);
				appStore.setCommandMenuOpen(true);
			}
		}
	);

	onMount(() => {
		workspaceStore.setChatVisible(false);
		workspaceStore.setCurrentRowId(currentRowId);
		if (!workspaceStore.currentTabId) {
			workspaceStore.setCurrentTabId(Array.from(tabIds)[0]);
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
				callback: () => workspaceStore.nextRow(),
				preventDefault: true
			},
			{
				key: 'i',
				modifier: ['ctrl'],
				callback: () => workspaceStore.prevRow(),
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
				callback: () => {
					workspaceStore.toggleExplorer();
				},
				preventDefault: true
			},
			{
				key: 'w',
				modifier: ['meta'],
				callback: () => {
					if (!workspaceStore.currentTabId) return;
					if (tabs.length === 0) return;
					return workspaceStore.removeTab({ tabId: workspaceStore.currentTabId });
				},
				preventDefault: true
			}
		]
	}}
/>

<PaneGroup direction="horizontal" class="mt-8 bg-base-200">
	{#if workspaceStore.explorerVisible}
		<Pane
			defaultSize={getBreakpointValue({ sm: 1 / 3, md: 1 / 4, lg: 1 / 6, xl: 1 / 8 })}
			minSize={10}
			maxSize={50}
			class="flex flex-col h-full pl-1 pb-1"
			order={1}
		>
			<TabExplorer />
		</Pane>
		<PaneResizer class="h-full w-1 cursor-col-resize" />
	{/if}
	<Pane defaultSize={1 / 2} order={2}>
		{#if tabs.length > 0}
			<ScrollArea.Root
				class={clsx(
					'relative h-full w-full overflow-hidden pb-1',
					workspaceStore.chatVisible ? 'pr-0' : 'pr-1',
					workspaceStore.explorerVisible ? 'pl-0' : 'pl-1'
				)}
			>
				<ScrollArea.Viewport
					class="rounded-lg border-2 border-base-300 w-full h-full !overflow-x-auto overscroll-none"
				>
					{#if editorStore.monacoReady}
						<Virtualizer data={tabs} getKey={(tab, index) => tab?.id ?? index} horizontal>
							{#snippet children(tab)}
								<div
									class={clsx('h-full flex flex-col')}
									data-tab-id={tab.id}
									style={tabs.length > 1
										? `width: calc(${innerWidth * 0.5}px - 6px);`
										: `width: calc(${innerWidth}px - 0.5rem);`}
								>
									<EditorTab {tab} />
								</div>
							{/snippet}
						</Virtualizer>
					{/if}
				</ScrollArea.Viewport>
			</ScrollArea.Root>
		{:else}
			<div class="flex flex-col h-full w-full justify-center items-center">
				<p>No tabs</p>
			</div>
		{/if}
	</Pane>
	{#if workspaceStore.chatVisible}
		<PaneResizer class="h-full w-1 cursor-col-resize" />
		<Pane
			defaultSize={getBreakpointValue({ sm: 1 / 3, md: 1 / 4, lg: 1 / 6, xl: 1 / 8 })}
			minSize={10}
			maxSize={50}
			class="flex flex-col h-full pr-1 pb-1"
			order={3}
		>
			<Chat />
		</Pane>
	{/if}
</PaneGroup>
