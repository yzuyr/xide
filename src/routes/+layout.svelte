<script lang="ts">
	import '../app.css';
	import '$lib/workers';
	import '@fontsource-variable/geist-mono';
	import '@fontsource-variable/geist';
	import { watchImmediate } from '@tauri-apps/plugin-fs';
	import { onMount, type Snippet } from 'svelte';
	import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
	import { appStore } from '$lib/store/app.svelte';
	import CommandMenu from '$lib/components/command-menu.svelte';
	import NavigationBar from '$lib/components/navigation-bar.svelte';
	import { configStore, getConfigPath } from '$lib/store/config.svelte';

	const { children }: { children: Snippet } = $props();

	let window = $state<Window>();
	let isInitializingConfig = $state(false);

	$effect(() => {
		document.documentElement.setAttribute('data-theme', appStore.theme);
	});

	onMount(() => {
		window = getCurrentWindow();
		window.theme().then((theme) => {
			if (!theme) return;
			appStore.theme = theme;
		});
		let unlistenTheme: () => void;
		let unwatchConfig: () => void;
		window
			.onThemeChanged((theme) => {
				appStore.theme = theme.payload;
			})
			.then((unlisten) => {
				unlistenTheme = unlisten;
			});
		getConfigPath().then((path) => {
			watchImmediate(path, async () => {
				// Ignore config changes during initialization to prevent race condition
				if (!isInitializingConfig) {
					appStore.setConfigDirty(true);
				}
			}).then((unwatchConfigFn) => {
				unwatchConfig = unwatchConfigFn;
			});
		});

		// Set flag before config initialization
		isInitializingConfig = true;
		configStore.init().then(() => {
			// Increased timeout to handle slower file operations in large directories
			setTimeout(() => {
				isInitializingConfig = false;
				appStore.setConfigDirty(false);
			}, 200);
		});
		appStore.setupHighlighter();
		return () => {
			unlistenTheme?.();
			unwatchConfig?.();
		};
	});
</script>

<CommandMenu />
<div class="flex flex-col h-screen bg-base-200">
	<NavigationBar />
	<div class="flex flex-col flex-1 bg-base-200">
		{@render children()}
	</div>
</div>
