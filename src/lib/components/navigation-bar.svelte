<script lang="ts">
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { appStore } from '$lib/store/app.svelte';
	import {
		SearchIcon,
		CogIcon,
		ChevronLeftIcon,
		ChevronRightIcon,
		MessageCircleIcon,
		PanelLeftIcon,
		FolderIcon
	} from 'lucide-svelte';
	import { configStore } from '$lib/store/config.svelte';
	import { emit } from '@tauri-apps/api/event';
	import SegmentControl from './segment-control.svelte';
	import clsx from 'clsx';

	const rowIndex = $derived(
		workspaceStore.currentRowId
			? workspaceStore.rows.findIndex((row) => row.id === workspaceStore.currentRowId)
			: -1
	);
	const tabIndex = $derived(
		rowIndex >= 0 && workspaceStore.currentTabId
			? Array.from(workspaceStore.rows[rowIndex].tabIds).findIndex(
					(tabId) => tabId === workspaceStore.currentTabId
				)
			: -1
	);

	const leftSegmentActions = $derived([
		{
			active: false,
			onClick: () =>
				workspaceStore.currentTabId &&
				workspaceStore.prevTab({ tabId: workspaceStore.currentTabId }),
			icon: ChevronLeftIcon as never
		},
		{
			active: workspaceStore.explorerVisible,
			onClick: () => workspaceStore.toggleExplorer(),
			label: `${rowIndex >= 0 ? rowIndex : 0}/${tabIndex >= 0 ? tabIndex : 0}`,
			icon: PanelLeftIcon as never
		},
		{
			active: false,
			onClick: () =>
				workspaceStore.currentTabId &&
				workspaceStore.nextTab({ tabId: workspaceStore.currentTabId }),
			icon: ChevronRightIcon as never
		}
	]);

	const rightSegmentActions = $derived([
		{
			active: false,
			onClick: () => appStore.toggleCommandMenu(),
			icon: SearchIcon as never
		},
		...(workspaceStore.rootDir
			? [
					{
						active: workspaceStore.chatVisible,
						onClick: () => workspaceStore.toggleChat(),
						icon: MessageCircleIcon as never
					}
				]
			: [])
	]);

	const projectName = $derived(workspaceStore.rootDir?.split('/').pop());

	async function reloadEditor() {
		await configStore.restore();
		await emit('reload-editor');
		appStore.setConfigDirty(false);
	}
</script>

<div
	class={clsx(
		'flex px-2 py-4 h-8 bg-base-200 items-center justify-between border-b-2 border-base-300',
		!workspaceStore.explorerVisible && 'pl-20'
	)}
	data-tauri-drag-region
>
	<div class="flex gap-1">
		<SegmentControl actions={leftSegmentActions} />
		{#if projectName}
			<button class="btn btn-xs" onclick={() => workspaceStore.selectRootDir()}>
				<FolderIcon size={16} />
				<span class="truncate font-medium">{projectName}</span>
			</button>
		{/if}
	</div>
	<div class="flex gap-1">
		{#if appStore.configDirty}
			<button type="button" class="btn btn-xs" onclick={reloadEditor}>Reload Editor</button>
		{/if}
		<SegmentControl actions={rightSegmentActions} />
	</div>
</div>
