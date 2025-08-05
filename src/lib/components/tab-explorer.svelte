<script lang="ts">
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/store/app.svelte';
	import { workspaceStore, type Tab } from '$lib/store/workspace.svelte';
	import clsx from 'clsx';
	import { createForm } from 'felte';
	import {
		ChevronDownIcon,
		CogIcon,
		EyeOffIcon,
		FileIcon,
		PlusIcon,
		SearchIcon,
		XIcon
	} from 'lucide-svelte';
	import { matchSorter } from 'match-sorter';
	import type { SvelteSet } from 'svelte/reactivity';

	const { form, data } = createForm({
		initialValues: {
			search: ''
		}
	});

	function addTab(rowId: string) {
		workspaceStore.setCurrentRowId(rowId);
		return appStore.toggleCommandMenu();
	}

	function switchTab(tab: Tab) {
		workspaceStore.setCurrentTabId(tab.id);
		workspaceStore.setCurrentRowId(tab.rowId);
		return goto(`/rows/${tab.rowId}`);
	}

	function tabIdsToTabs(tabIds: SvelteSet<string>, search: string) {
		const tabs = Array.from(tabIds)
			.map((tabId) => workspaceStore.findTabById(tabId))
			.filter((tab) => tab !== undefined);
		return search ? matchSorter(tabs, search, { keys: ['filePath'] }) : tabs;
	}
</script>

<div class="flex flex-col flex-1 shrink-0 bg-base-200">
	<div class="flex h-8 justify-between items-center px-1" data-tauri-drag-region>
		<div></div>
		<div class="flex">
			<button
				type="button"
				class="btn btn-ghost btn-square btn-xs"
				onclick={() => workspaceStore.openSettings()}
			>
				<CogIcon size={16} />
			</button>
		</div>
	</div>
	<form use:form class="flex flex-col flex-1 px-1 mt-2">
		<label class="input input-sm !outline-none focus-within:border-primary w-full">
			<SearchIcon size={16} />
			<input name="search" placeholder="Search tabs" spellcheck="false" autocomplete="off" />
		</label>
		<div class="flex justify-between items-center mt-2">
			<div class="flex gap-1 text-xs font-semibold text-base-content/50 pl-1">
				<span>Rows</span>
				<div class="badge badge-xs badge-neutral w-4 h-4 rounded-full p-0">
					{workspaceStore.rows.length}
				</div>
			</div>
			<button
				type="button"
				class="btn btn-xs btn-ghost btn-square"
				onclick={() => workspaceStore.addRow()}
			>
				<PlusIcon size={16} />
			</button>
		</div>
		{#each workspaceStore.rows as row, rowIndex}
			<div class={clsx('flex flex-col overflow-hidden')}>
				<div
					class={clsx(
						'flex justify-between items-center bg-base-300 rounded p-[2px]',
						row.id === workspaceStore.currentRowId &&
							'text-indigo-700 dark:text-indigo-400 bg-primary'
					)}
				>
					<button type="button" class="btn btn-ghost btn-square btn-xs">
						<ChevronDownIcon size={16} />
					</button>
					<span class="text-xs flex-1 font-[Geist_Mono]">[{rowIndex}]</span>
					<div class="flex">
						<button
							type="button"
							class="btn btn-ghost btn-square btn-xs"
							onclick={() => addTab(row.id)}
						>
							<FileIcon size={16} />
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-square btn-xs"
							onclick={() => workspaceStore.removeRow(row.id)}
						>
							<XIcon size={16} />
						</button>
					</div>
				</div>
				<ul class="menu menu-sm p-0 w-full bg-base-200">
					{#each tabIdsToTabs(row.tabIds, $data.search) as tab}
						<li>
							<div
								class={clsx(
									'flex font-[Geist_Mono] gap-0 p-[2px] group',
									tab.id === workspaceStore.currentTabId && 'menu-active'
								)}
							>
								<button
									type="button"
									class="btn btn-ghost btn-xs truncate font-normal flex-1 justify-start"
									onclick={() => switchTab(tab)}>{tab?.filePath ?? 'Untitled'}</button
								>
								<button class="btn btn-ghost btn-square btn-xs opacity-0 group-hover:opacity-100"
									><EyeOffIcon size={16} /></button
								>
								<button class="btn btn-ghost btn-square btn-xs opacity-0 group-hover:opacity-100"
									><XIcon size={16} /></button
								>
							</div>
						</li>
					{:else}
						<p>No tabs</p>
					{/each}
				</ul>
			</div>
		{/each}
	</form>
</div>
