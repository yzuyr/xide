<script lang="ts">
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/store/app.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { shortcut } from '@svelte-put/shortcut';
	import { FolderIcon } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import packageJson from '../../package.json';

	$effect(() => {
		if (workspaceStore.rootDir && workspaceStore.rows.flatMap((row) => row.tabIds).length === 0) {
			appStore.setCommandMenuOpen(true);
		}
	});

	async function selectRootDir() {
		try {
			await workspaceStore.selectRootDir();
			await goto(`/rows/${workspaceStore.rows[0].id}`);
		} catch (e) {
			console.error(e);
		}
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

<div class="flex flex-col flex-1">
	<div class="flex flex-col flex-1 justify-center items-center">
		<button type="button" class="btn" onclick={selectRootDir}>
			<FolderIcon size={16} />
			<span>Open Project</span>
		</button>
	</div>
	<div class="flex justify-between items-center px-4 py-2">
		<div class="text-sm">Xide {packageJson.version}</div>
		<div class="flex items-center gap-2">
			<a class="link text-sm" href="https://xide.dev" target="_blank" rel="noopener noreferrer"
				>Docs</a
			>
			<a
				class="link text-sm"
				href="https://github.com/yzuyr/xide"
				target="_blank"
				rel="noopener noreferrer">GitHub</a
			>
			<a class="link text-sm" href="https://x.com/xidedev" target="_blank" rel="noopener noreferrer"
				>X</a
			>
		</div>
	</div>
</div>
