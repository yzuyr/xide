<script lang="ts">
	import { appStore } from '$lib/store/app.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import clsx from 'clsx';
	import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from 'lucide-svelte';

	function addTab(rowId: string) {
		workspaceStore.setCurrentRowId(rowId);
		return appStore.toggleCommandMenu();
	}
</script>

<div class="flex flex-col flex-1 shrink-0 bg-base-200 gap-1">
	<div class="flex flex-col flex-1 gap-1">
		{#each workspaceStore.rows as row, rowIndex}
			<div
				class={clsx(
					'flex flex-col border-2 border-base-300 bg-base-300 overflow-hidden rounded-lg',
					row.id === workspaceStore.currentRowId && 'bg-primary'
				)}
			>
				<div class="flex justify-between items-center text-primary-content">
					<span class="text-sm pl-1 font-[Geist_Mono]">[{rowIndex}]</span>
					<div class="flex">
						<button class="btn btn-ghost btn-square btn-xs" onclick={() => addTab(row.id)}>
							<PlusIcon size={16} />
						</button>
						<button
							class="btn btn-ghost btn-square btn-xs"
							onclick={() => workspaceStore.removeRow(row.id)}
						>
							<XIcon size={16} />
						</button>
					</div>
				</div>
				<ul class="menu menu-sm p-1 w-full bg-base-100">
					{#each row.tabIds as tabId}
						{@const tab = workspaceStore.findTabById(tabId)}
						<li>
							<a
								href={`/rows/${row.id}?tabId=${tabId}`}
								class={clsx(tabId === workspaceStore.currentTabId && 'menu-active')}
								>{tab?.filePath ?? 'Untitled'}</a
							>
						</li>
					{:else}
						<p>No tabs</p>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
	<div class="flex justify-between items-center">
		<button
			class="flex-1 btn btn-sm btn-ghost justify-start"
			onclick={() => workspaceStore.addRow()}
		>
			<PlusIcon size={16} />
			<span>Add Row</span>
		</button>
		<div class="flex items-center">
			<button class="btn btn-ghost btn-square btn-sm" onclick={() => workspaceStore.prevRow()}>
				<ChevronUpIcon size={16} />
			</button>
			<button class="btn btn-ghost btn-square btn-sm" onclick={() => workspaceStore.nextRow()}>
				<ChevronDownIcon size={16} />
			</button>
		</div>
	</div>
</div>
