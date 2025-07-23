<script lang="ts">
	import '../app.css';
	import '@fontsource-variable/geist-mono';
	import '@fontsource-variable/geist';
	import { browser } from '$app/environment';
	import { watchImmediate } from '@tauri-apps/plugin-fs';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount, type Snippet } from 'svelte';
	import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
	import { appStore } from '$lib/store/app.svelte';
	import CommandMenu from '$lib/components/command-menu.svelte';
	import NavigationBar from '$lib/components/navigation-bar.svelte';
	import { configStore, getConfigPath } from '$lib/store/config.svelte';
	import { emit } from '@tauri-apps/api/event';

	const { children }: { children: Snippet } = $props();

	let window = $state<Window>();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser
			}
		}
	});

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
				appStore.setConfigDirty(true);
			}).then((unwatchConfigFn) => {
				unwatchConfig = unwatchConfigFn;
			});
		});
		configStore.init().then(() => {
			setTimeout(() => {
				appStore.setConfigDirty(false);
			}, 50);
		});
		return () => {
			unlistenTheme?.();
			unwatchConfig?.();
		};
	});
</script>

<QueryClientProvider client={queryClient}>
	<CommandMenu />
	<div class="flex flex-col h-screen bg-base-200">
		<NavigationBar />
		<div class="flex flex-col flex-1 bg-base-200">
			{@render children()}
		</div>
	</div>
</QueryClientProvider>
