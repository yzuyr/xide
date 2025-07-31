<script lang="ts">
	import { shortcut } from '@svelte-put/shortcut';
	import { open } from '@tauri-apps/plugin-dialog';
	import EditorTab from '$lib/components/editor-tab.svelte';
	import { workspaceStore, type Tab } from '$lib/store/workspace.svelte';
	import { appStore } from '$lib/store/app.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import Chat from '$lib/components/chat.svelte';
	import { editorStore } from '$lib/store/editor.svelte';
	import type { ScrollToIndexAlign } from 'virtua';
	import { Virtualizer } from 'virtua/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
	import TabExplorer from '$lib/components/tab-explorer.svelte';
	import { watch, ElementSize } from 'runed';
	import { match } from 'ts-pattern';
	import clsx from 'clsx';

	let virtualizer = $state<Virtualizer<any>>();
	const currentRowId = $derived(page.params.rowId);
	let innerWidth = $state(0);
	const tabIds = $derived(
		workspaceStore.findRowById(currentRowId)?.tabIds ?? new SvelteSet<string>()
	);
	const tabs = $derived(
		Array.from(tabIds)
			.map((tabId) => workspaceStore.findTabById(tabId))
			.filter((tab) => tab !== undefined)
	);
	const viewportSize = new ElementSize(
		() => document.querySelector('[data-scroll-container]') as HTMLElement
	);

	async function openFilePicker() {
		if (!workspaceStore.rootDir) return;
		const files = await open({
			defaultPath: workspaceStore.rootDir,
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

	function getTabSize(tab: Tab) {
		return match(tab.size)
			.with('sm', () => viewportSize.width * 0.5 - 4)
			.with('md', () => viewportSize.width * 0.75 - 4)
			.with('lg', () => viewportSize.width - 6)
			.exhaustive();
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

	function scrollToTab(tabId: string) {
		const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
		if (tabIndex === -1) return;
		const align = match(tabIndex)
			.with(0, () => 'start')
			.with(tabs.length - 1, () => 'end')
			.otherwise(() => 'center');
		virtualizer?.scrollToIndex(tabIndex, {
			align: align as ScrollToIndexAlign,
			smooth: true
		});
	}

	watch(
		() => tabs.length,
		(length) => {
			if (length !== 0) return;
			workspaceStore.setCurrentTabId(undefined);
			appStore.setCommandMenuOpen(true);
		}
	);

	onMount(() => {
		let unlistenScrollToTab: () => void;
		workspaceStore.setChatVisible(false);
		workspaceStore.setCurrentRowId(currentRowId);
		if (!workspaceStore.currentTabId) {
			workspaceStore.setCurrentTabId(Array.from(tabIds)[0]);
		}
		editorStore.loadEditor();
		listen<{ tabId: string }>('scroll-to-tab', ({ payload }) => {
			scrollToTab(payload.tabId);
		}).then((unlisten) => {
			unlistenScrollToTab = unlisten;
		});
		editorStore.setupCopilot();
		return () => {
			unlistenScrollToTab?.();
		};
	});

	$effect(() => {
		console.log(viewportSize);
	});
</script>

<svelte:window
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
			defaultSize={getBreakpointValue({ sm: 1 / 4, md: 1 / 5, lg: 1 / 6, xl: 1 / 8 })}
			minSize={10}
			maxSize={50}
			class="flex flex-col h-full pl-1 pb-1"
			order={1}
		>
			<TabExplorer />
		</Pane>
		<PaneResizer class="h-full w-1 cursor-col-resize" />
	{/if}
	<Pane
		data-scroll-container
		defaultSize={1 / 2}
		order={2}
		class={clsx(
			'!overflow-x-auto overscroll-x-none rounded-lg border-2 border-base-300 mb-1',
			workspaceStore.explorerVisible ? 'ml-0' : 'ml-1',
			workspaceStore.chatVisible ? 'mr-0' : 'mr-1'
		)}
	>
		{#if tabs.length > 0}
			<Virtualizer
				data={tabs}
				getKey={(tab) => tab.id}
				itemSize={506}
				horizontal
				bind:this={virtualizer}
			>
				{#snippet children(tab)}
					<div
						class="h-full flex flex-col"
						data-tab-id={tab.id}
						style:width={`${getTabSize(tab)}px`}
					>
						{#if editorStore.monacoReady}
							<EditorTab {tab} />
						{/if}
					</div>
				{/snippet}
			</Virtualizer>
		{:else}
			<div class="flex flex-col h-full w-full justify-center items-center">
				<p>No tabs</p>
			</div>
		{/if}
	</Pane>
	{#if workspaceStore.chatVisible}
		<PaneResizer class="h-full w-1 cursor-col-resize" />
		<Pane
			defaultSize={getBreakpointValue({ sm: 1 / 4, md: 1 / 5, lg: 1 / 6, xl: 1 / 8 })}
			minSize={10}
			maxSize={50}
			class="flex flex-col h-full pr-1 pb-1"
			order={3}
		>
			<Chat />
		</Pane>
	{/if}
</PaneGroup>
