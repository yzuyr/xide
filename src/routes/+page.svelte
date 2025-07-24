<script lang="ts">
	import { goto } from '$app/navigation';
	import Chat from '$lib/components/chat.svelte';
	import { appStore } from '$lib/store/app.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { shortcut } from '@svelte-put/shortcut';
	import clsx from 'clsx';
	import { FolderIcon, PlusIcon, XIcon } from 'lucide-svelte';
	import { onMount } from 'svelte';

	function navigateToTab(tabId: string) {
		workspaceStore.setCurrentTabId(tabId);
		const tab = workspaceStore.findTabById(tabId);
		return goto(`/rows/${tab?.rowId}`);
	}

	function addTabToRow(rowId: string) {
		workspaceStore.setCurrentRowId(rowId);
		appStore.setCommandMenuOpen(true);
	}

	$effect(() => {
		if (workspaceStore.rootDir && workspaceStore.rows.flatMap((row) => row.tabIds).length === 0) {
			appStore.setCommandMenuOpen(true);
		}
	});

	onMount(() => {
		workspaceStore.setChatVisible(false);
		workspaceStore.setCurrentRowId(workspaceStore.rows[0].id);
	});
</script>

<svelte:window
	use:shortcut={{
		trigger: [
			{
				key: 'k',
				modifier: ['meta'],
				callback: () => appStore.toggleCommandMenu(),
				preventDefault: true
			}
		]
	}}
/>

<div class="flex flex-1">
	{#if workspaceStore.rootDir}
		<div class="flex flex-col flex-[2] justify-center items-center gap-2 pt-8">
			{#each workspaceStore.rows as row, rowIndex}
				<div class="group flex gap-2 items-center">
					<button
						type="button"
						class="btn btn-ghost font-[Geist_Mono] text-xl font-semibold h-20 w-20 items-center justify-center"
						onclick={() => workspaceStore.removeRow(row.id)}
					>
						<span class="group-hover:hidden">{rowIndex}</span>
						<XIcon class="hidden group-hover:flex" />
					</button>
					{#each row.tabIds as tabId}
						{@const tab = workspaceStore.findTabById(tabId)}
						{#if tab}
							{@const fileName = tab.filePath.split('/').pop()}
							<button onclick={() => navigateToTab(tab.id)} class="btn w-32 h-20">
								<span class="text-sm truncate">{fileName}</span></button
							>
						{/if}
					{/each}
					<button
						type="button"
						onclick={() => addTabToRow(row.id)}
						class={clsx(
							'btn w-32 h-20 group-hover:opacity-100',
							row.tabIds.length === 0 ? 'opacity-100' : 'opacity-0'
						)}
					>
						<PlusIcon /></button
					>
				</div>
			{/each}
			<div class="flex gap-2 items-center">
				<div class="font-[Geist_Mono] text-xl w-20 items-center justify-center"></div>
				<button type="button" onclick={() => workspaceStore.addRow()} class="btn w-32 h-20">
					<PlusIcon /></button
				>
			</div>
		</div>
		{#if workspaceStore.chatVisible}
			<div class="flex flex-col flex-1 p-2 pt-8">
				<Chat />
			</div>
		{/if}
	{:else}
		<div class="flex flex-col flex-1 justify-center items-center">
			<button type="button" class="btn" onclick={() => workspaceStore.selectRootDir()}>
				<FolderIcon size={16} />
				<span>Open Project</span>
			</button>
		</div>
	{/if}
</div>
