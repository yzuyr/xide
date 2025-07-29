<script lang="ts">
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/store/app.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { shortcut } from '@svelte-put/shortcut';
	import { FolderIcon } from 'lucide-svelte';
	import { onMount } from 'svelte';

	$effect(() => {
		if (workspaceStore.rootDir && workspaceStore.rows.flatMap((row) => row.tabIds).length === 0) {
			appStore.setCommandMenuOpen(true);
		}
	});

	async function selectRootDir() {
		await workspaceStore.selectRootDir();
		await goto(`/rows/${workspaceStore.rows[0].id}`);
	}

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
	<div class="flex flex-col flex-1 justify-center items-center">
		<button type="button" class="btn" onclick={selectRootDir}>
			<FolderIcon size={16} />
			<span>Open Project</span>
		</button>
	</div>
</div>
