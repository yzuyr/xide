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

	const rowIndex = $derived(
		workspaceStore.rows.findIndex((row) => row.id === workspaceStore.currentRowId)
	);
	const tabIndex = $derived(
		workspaceStore.rows[rowIndex].tabs.findIndex((tab) => tab.id === workspaceStore.currentTabId)
	);
</script>

<div
	class="flex p-2 h-8 fixed top-0 left-0 right-0 z-10 bg-base-200 pl-20 items-center justify-between"
	data-tauri-drag-region
>
	{#if workspaceStore.currentTabId}
		<div class="flex gap-1">
			<button
				class="btn btn-ghost btn-square btn-xs"
				onclick={() => workspaceStore.prevTab({ tabId: workspaceStore.currentTabId })}
			>
				<ChevronLeftIcon size={16} />
			</button>
			<a href="/" class="btn btn-xs">
				{rowIndex}/{tabIndex}
			</a>
			<button
				class="btn btn-ghost btn-square btn-xs"
				onclick={() => workspaceStore.nextTab({ tabId: workspaceStore.currentTabId })}
			>
				<ChevronRightIcon size={16} />
			</button>
		</div>
	{:else}
		<div></div>
	{/if}
	<div class="flex gap-1">
		<button class="btn btn-xs btn-square btn-ghost" onclick={() => appStore.toggleCommandMenu()}
			><SearchIcon size={16} /></button
		>
		{#if workspaceStore.rootDir}
			<button
				class={clsx('btn btn-xs btn-square', !workspaceStore.chatVisible && 'btn-ghost')}
				onclick={() => workspaceStore.toggleChat()}><MessageCircleIcon size={16} /></button
			>
		{/if}
		<button class="btn btn-xs btn-square btn-ghost" onclick={() => workspaceStore.openSettings()}
			><CogIcon size={16} /></button
		>
	</div>
</div>
