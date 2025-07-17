<script lang="ts">
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import loader from '@monaco-editor/loader';
	import { shortcut } from '@svelte-put/shortcut';
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
	import { open } from '@tauri-apps/plugin-dialog';
	import EditorTab from '$lib/components/editor-tab.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { style } from 'svelte-body';
	import { appStore } from '$lib/store/app.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { emit } from '@tauri-apps/api/event';
	import { goto } from '$app/navigation';
	import Chat from '$lib/components/chat.svelte';
	import { createHighlighter } from 'shiki';
	import { SHIKI_LANGUAGES } from '$lib/const';
	import { shikiToMonaco } from '@shikijs/monaco';
	import { openUrl } from '@tauri-apps/plugin-opener';
	import { Schemas } from '@codingame/monaco-vscode-api/vscode/vs/base/common/network';
	import {
		DelegateFileSystemProvider,
		registerCustomProvider
	} from '@codingame/monaco-vscode-files-service-override';
	import { findUp, TauriFileSystemProvider } from '$lib/fs';
	import { readTextFile } from '@tauri-apps/plugin-fs';
	import JSON5 from 'json5';
	import { ResultAsync } from 'neverthrow';

	let monaco = $state<typeof Monaco>();
	let monacoLoaded = $state(false);
	let fsOverlayDisposable = $state<Monaco.IDisposable>();
	const currentTabId = $derived(
		Number.parseInt(page.url.searchParams.get('tabId') ?? '0') ?? workspaceStore.currentTabId
	);
	const currentRowId = $derived(page.params.rowId);
	let innerWidth = $state(0);
	const tabs = $derived(workspaceStore.findRowById(currentRowId)?.tabs ?? []);
	const bodyWidth = $derived(tabs.length === 1 ? innerWidth : tabs.length * innerWidth * 0.75);
	const bodyStyle = $derived(tabs.length > 0 ? `width: ${bodyWidth}px;` : 'width: 100%;');

	async function openFilePicker() {
		const files = await open({
			multiple: true,
			directory: false
		});
		if (!files) return;
		for (const filePath of files) {
			workspaceStore.addTab({ rowId: currentRowId, filePath });
		}
	}

	async function loadConfig() {
		if (!workspaceStore.rootDir) return;
		if (!monaco) return;
		const tsconfigPath = await ResultAsync.fromPromise(
			findUp('tsconfig.json', workspaceStore.rootDir),
			(error) => error
		);
		if (tsconfigPath.isErr()) return;
		const tsconfigContent = await readTextFile(tsconfigPath.value ?? '');
		const tsconfig = JSON5.parse(tsconfigContent);
		monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
			...tsconfig.compilerOptions,
			moduleResolution:
				tsconfig?.compilerOptions?.moduleResolution === 'bundler'
					? monaco.languages.typescript.ModuleResolutionKind.NodeJs
					: tsconfig?.compilerOptions?.moduleResolution
		});
	}

	async function loadMonaco() {
		const fsProvider = new DelegateFileSystemProvider({
			delegate: new TauriFileSystemProvider(),
			toDelegate: (uri) => uri,
			fromDeletate: (uri) => uri
		});
		const monacoEditor = await import('monaco-editor');
		const highlighter = await createHighlighter({
			themes: ['houston', 'min-light'],
			langs: SHIKI_LANGUAGES
		});

		loader.config({ monaco: monacoEditor.default });
		monaco = await loader.init();
		registerCustomProvider(Schemas.file, fsProvider);
		for (const language of SHIKI_LANGUAGES) {
			monaco.languages.register({ id: language });
		}
		shikiToMonaco(highlighter, monaco);
		monaco.editor.registerLinkOpener({
			async open(resource) {
				await openUrl(resource.toString());
				return true;
			}
		});
		monaco.editor.registerEditorOpener({
			openCodeEditor(source, resource, selectionOrPosition) {
				console.log('>>>OPEN', source, resource, selectionOrPosition);
				return true;
			}
		});
		await loadConfig();
		monacoLoaded = true;
	}

	$effect(() => {
		if (tabs.length === 0) {
			goto('/');
			return;
		}
	});

	onMount(() => {
		workspaceStore.setChatVisible(false);
		workspaceStore.setCurrentRowId(currentRowId);
		emit('focus-tab', { id: currentTabId });
		loadMonaco();

		return () => {
			fsOverlayDisposable?.dispose();
		};
	});
</script>

<svelte:body use:style={bodyStyle} />

<svelte:window
	bind:innerWidth
	use:shortcut={{
		trigger: [
			{
				key: 'o',
				modifier: ['ctrl', 'meta'],
				callback: openFilePicker,
				preventDefault: true
			},
			{
				key: 'k',
				modifier: ['ctrl'],
				callback: () => workspaceStore.nextRow({ rowId: currentRowId }),
				preventDefault: true
			},
			{
				key: 'i',
				modifier: ['ctrl'],
				callback: () => workspaceStore.prevRow({ rowId: currentRowId }),
				preventDefault: true
			},
			{
				key: 'k',
				modifier: ['meta'],
				callback: () => appStore.toggleCommandMenu(),
				preventDefault: true
			},
			{
				key: 'l',
				modifier: ['meta'],
				callback: () => goto('/'),
				preventDefault: true
			}
		]
	}}
/>

{#if tabs.length > 0}
	<PaneGroup direction="horizontal" class="flex-1 mt-8 bg-base-200 px-1 pb-1">
		{#each tabs as tab, index}
			<Pane defaultSize={50} minSize={25} class="h-full flex">
				{#if monacoLoaded && monaco}
					<EditorTab {monaco} {tab} />
				{/if}
			</Pane>
			{#if workspaceStore.chatVisible || index < tabs.length - 1}
				<PaneResizer class="bg-base-200 w-1 h-full"></PaneResizer>
			{/if}
		{/each}
		{#if workspaceStore.chatVisible}
			<Pane defaultSize={25} minSize={25} class="h-full flex">
				<Chat />
			</Pane>
		{/if}
	</PaneGroup>
{:else}
	<div class="flex-1 flex items-center justify-center">
		<div class="text-sm">No tabs open</div>
	</div>
{/if}
