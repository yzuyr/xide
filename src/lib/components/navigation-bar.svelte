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
			label: `${rowIndex >= 0 ? rowIndex : '?'}/${tabIndex >= 0 ? tabIndex : '?'}`,
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
		{
			active: workspaceStore.chatVisible,
			onClick: () => workspaceStore.toggleChat(),
			icon: MessageCircleIcon as never
		},
		{
			active: false,
			onClick: () => workspaceStore.openSettings(),
			icon: CogIcon as never
		}
	]);

	const projectName = $derived(workspaceStore.rootDir?.split('/').pop());

	async function reloadEditor() {
		await configStore.restore();
		await emit('reload-editor');
		appStore.setConfigDirty(false);
	}
</script>

<div
	class="flex p-2 h-8 fixed top-0 left-0 right-0 z-10 bg-base-200 pl-20 items-center justify-between"
	data-tauri-drag-region
>
	<div class="flex gap-1">
		{#if workspaceStore.currentTabId}
			<SegmentControl actions={leftSegmentActions} />
		{/if}
		{#if projectName}
			<button class="btn btn-xs" onclick={() => workspaceStore.selectRootDir()}>
				<FolderIcon size={16} />
				{projectName}
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
