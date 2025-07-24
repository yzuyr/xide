<script lang="ts">
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { appStore } from '$lib/store/app.svelte';
	import {
		SearchIcon,
		CogIcon,
		ChevronLeftIcon,
		ChevronRightIcon,
		MessageCircleIcon
	} from 'lucide-svelte';
	import clsx from 'clsx';
	import { configStore } from '$lib/store/config.svelte';
	import { emit } from '@tauri-apps/api/event';

	const rowIndex = $derived(
		workspaceStore.currentRowId
			? workspaceStore.rows.findIndex((row) => row.id === workspaceStore.currentRowId)
			: -1
	);
	const tabIndex = $derived(
		rowIndex >= 0 && workspaceStore.currentTabId
			? workspaceStore.rows[rowIndex].tabIds.findIndex(
					(tabId) => tabId === workspaceStore.currentTabId
				)
			: -1
	);

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
	{#if workspaceStore.currentTabId}
		<div class="flex gap-1">
			<button
				type="button"
				class="btn btn-ghost btn-square btn-xs"
				onclick={() =>
					workspaceStore.currentTabId &&
					workspaceStore.prevTab({ tabId: workspaceStore.currentTabId })}
			>
				<ChevronLeftIcon size={16} />
			</button>
			<a href="/" class="btn btn-xs">
				{rowIndex >= 0 ? rowIndex : '?'}/{tabIndex >= 0 ? tabIndex : '?'}
			</a>
			<button
				type="button"
				class="btn btn-ghost btn-square btn-xs"
				onclick={() =>
					workspaceStore.currentTabId &&
					workspaceStore.nextTab({ tabId: workspaceStore.currentTabId })}
			>
				<ChevronRightIcon size={16} />
			</button>
		</div>
	{:else}
		<div></div>
	{/if}
	<div class="flex gap-1">
		{#if appStore.configDirty}
			<button type="button" class="btn btn-xs" onclick={reloadEditor}>Reload Editor</button>
		{/if}
		<button class="btn btn-xs btn-square btn-ghost" onclick={() => appStore.toggleCommandMenu()}
			><SearchIcon size={16} /></button
		>
		{#if workspaceStore.rootDir}
			<button
				type="button"
				class={clsx('btn btn-xs btn-square', !workspaceStore.chatVisible && 'btn-ghost')}
				onclick={() => workspaceStore.toggleChat()}><MessageCircleIcon size={16} /></button
			>
		{/if}
		<button
			type="button"
			class="btn btn-xs btn-square btn-ghost"
			onclick={() => workspaceStore.openSettings()}><CogIcon size={16} /></button
		>
	</div>
</div>
