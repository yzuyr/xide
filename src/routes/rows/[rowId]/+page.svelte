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
	import NavigationBar from '$lib/components/navigation-bar.svelte';

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
			.with('sm', () => viewportSize.width * 0.5)
			.with('md', () => viewportSize.width * 0.75)
			.with('lg', () => viewportSize.width)
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

		// Use requestAnimationFrame to ensure smooth scrolling
		requestAnimationFrame(() => {
			virtualizer?.scrollToIndex(tabIndex, {
				align: align as ScrollToIndexAlign,
				smooth: true
			});
		});
	}

	onMount(() => {
		let unlistenScrollToTab: () => void;
		workspaceStore.setChatVisible(false);
		workspaceStore.setCurrentRowId(currentRowId);
		if (!workspaceStore.currentTabId) {
			workspaceStore.setCurrentTabId(Array.from(tabIds)[0], false);
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
				key: 'i',
				modifier: ['meta'],
				callback: () => {
					workspaceStore.toggleChat();
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
	bind:innerWidth
/>

<PaneGroup direction="horizontal" class="bg-base-200">
	{#if workspaceStore.explorerVisible}
		<Pane
			defaultSize={getBreakpointValue({ sm: 1 / 3, md: 1 / 4, lg: 1 / 5, xl: 1 / 6 })}
			minSize={10}
			maxSize={50}
			class="flex flex-col h-full"
			order={1}
		>
			<TabExplorer />
		</Pane>
		<PaneResizer class="h-full w-[2px] bg-base-300 cursor-col-resize" />
	{/if}
	<Pane data-scroll-container defaultSize={1 / 2} order={2} class="rounded-lg bg-base-100">
		<div class="flex flex-col h-full w-full">
			<NavigationBar />
			<div class="flex-1 overflow-x-auto overscroll-x-none">
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
								style:width={tabs.length === 1 ? `${viewportSize.width}px` : `${getTabSize(tab)}px`}
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
			</div>
		</div>
	</Pane>
	{#if workspaceStore.chatVisible}
		<PaneResizer class="h-full w-[2px] bg-base-300 cursor-col-resize" />
		<Pane
			defaultSize={getBreakpointValue({ sm: 1 / 3, md: 1 / 4, lg: 1 / 5, xl: 1 / 6 })}
			minSize={10}
			maxSize={50}
			class="flex flex-col h-full"
			order={3}
		>
			<Chat />
		</Pane>
	{/if}
</PaneGroup>
