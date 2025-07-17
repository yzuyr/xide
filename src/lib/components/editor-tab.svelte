<script lang="ts">
	import { onMount } from 'svelte';
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import { emit, listen, type EventCallback } from '@tauri-apps/api/event';
	import { workspaceStore, type Tab } from '$lib/store/workspace.svelte';
	import { readTextFile } from '@tauri-apps/plugin-fs';
	import clsx from 'clsx';
	import { appStore } from '$lib/store/app.svelte';
	import { EXTENSION_TO_LANG } from '$lib/const';
	import { goto } from '$app/navigation';
	import { registerCompletion, CompletionCopilot } from 'monacopilot';
	import { join } from '@tauri-apps/api/path';
	import { watch } from 'runed';
	import { XIcon } from 'lucide-svelte';
	import { getConfig } from '$lib/config';

	const {
		tab,
		monaco
	}: {
		tab: Tab;
		monaco: typeof Monaco;
	} = $props();

	let editor = $state<Monaco.editor.IStandaloneCodeEditor>();
	let editorElement = $state<HTMLElement>();
	let wrapperElement = $state<HTMLElement>();
	let isFocused = $state(tab.id === workspaceStore.currentTabId);
	let innerHeight = $state(0);
	const row = $derived(workspaceStore.findRowById(tab.rowId));
	const isLastTab = $derived(row?.tabs[row?.tabs?.length - 1]?.id === tab.id);
	const fileName = $derived(tab.filePath.split('/').pop());

	function onBlur() {
		isFocused = false;
	}

	async function initializeEditor() {
		if (!editorElement) return;
		editor = monaco.editor.create(editorElement, {
			fontFamily: 'Geist Mono Variable',
			fontSize: 14,
			fontLigatures: true,
			lineNumbers: 'relative',
			automaticLayout: true,
			scrollbar: {
				alwaysConsumeMouseWheel: false,
				horizontal: 'hidden'
			},
			minimap: {
				enabled: false
			},
			wordWrap: 'on',
			value: ''
		});
		editor.updateOptions({
			theme: appStore.theme === 'dark' ? 'houston' : 'min-light'
		});
		editor.onDidFocusEditorWidget(focusHandler);
		editor.onDidFocusEditorText(focusHandler);
		editor.onDidBlurEditorText(onBlur);
		editor.onDidBlurEditorWidget(onBlur);
		editor.addAction({
			id: 'tab-next',
			label: 'Tab Next',
			keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyL],
			async run() {
				if (workspaceStore.chatVisible && isLastTab) {
					return emit('focus-chat');
				}
				return workspaceStore.nextTab({ tabId: tab.id });
			}
		});
		editor.addAction({
			id: 'tab-prev',
			label: 'Tab Prev',
			keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyJ],
			async run() {
				if (workspaceStore.chatVisible && row?.tabs[0]?.id === tab.id) {
					return emit('focus-chat');
				}
				return workspaceStore.prevTab({ tabId: tab.id });
			}
		});
		editor.addAction({
			id: 'row-next',
			label: 'Row Next',
			keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyK],
			async run() {
				return workspaceStore.nextRow({ rowId: tab.rowId });
			}
		});
		editor.addAction({
			id: 'row-prev',
			label: 'Row Prev',
			keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyI],
			async run() {
				return workspaceStore.prevRow({ rowId: tab.rowId });
			}
		});
		editor.addAction({
			id: 'command-menu',
			label: 'Command Menu',
			keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
			async run() {
				return appStore.toggleCommandMenu();
			}
		});
		editor.addAction({
			id: 'overview',
			label: 'Overview',
			keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
			async run() {
				return goto('/');
			}
		});
		editor.addAction({
			id: 'close-tab',
			label: 'Close Tab',
			keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW],
			async run() {
				return workspaceStore.removeTab({ tabId: tab.id });
			}
		});
	}

	async function loadFile() {
		if (!monaco) return;
		if (!editor) return;
		if (!workspaceStore.rootDir) return;
		const filePath = tab.external ? tab.filePath : await join(workspaceStore.rootDir, tab.filePath);
		const content = await readTextFile(filePath);
		const language =
			EXTENSION_TO_LANG[tab.filePath.split('.').pop() as keyof typeof EXTENSION_TO_LANG] ??
			'text/plain';
		const uri = monaco.Uri.file(tab.filePath);
		console.log('>>>U', uri, tab);
		let model = monaco.editor.getModel(uri);
		if (!model) {
			model = monaco.editor.createModel(content, language, uri);
		}
		editor.setModel(model);
		return language;
	}

	watch(
		() => innerHeight,
		() => {
			editor?.layout();
		}
	);

	watch(
		() => appStore.theme,
		() => {
			editor?.updateOptions({
				theme: appStore.theme === 'dark' ? 'houston' : 'min-light'
			});
		}
	);

	function focusHandler() {
		isFocused = true;
		workspaceStore.setCurrentTabId(tab.id);
		wrapperElement?.scrollIntoView({
			behavior: 'smooth'
		});
		editor?.focus();
	}

	onMount(() => {
		let unlistenFocusFn: () => void;
		let unregisterCompletionFn: () => void;
		initializeEditor().then(async () => {
			const config = await getConfig();
			if (!monaco) return;
			if (!editor) return;
			const language = await loadFile();
			if (!language) return;
			listen<{ id: string }>('focus-tab', ({ payload }) => {
				if (payload.id === tab.id) {
					focusHandler();
				}
			}).then((unlisten) => {
				unlistenFocusFn = unlisten;
			});
			const isEnv = tab.filePath.split('/').pop()?.endsWith('.env');
			if (isEnv) return;
			if (!config.ai.autocomplete.api_key) return;
			unregisterCompletionFn = registerCompletion(monaco, editor, {
				language,
				requestHandler: async ({ body }) => {
					const copilot = new CompletionCopilot(config.ai.autocomplete.api_key, {
						provider: 'mistral',
						model: 'codestral'
					});
					const completion = await copilot.complete({ body });
					return completion;
				}
			}).deregister;
			if (isFocused) {
				focusHandler();
			}
		});

		return () => {
			editor?.dispose();
			unlistenFocusFn?.();
			unregisterCompletionFn?.();
		};
	});
</script>

<svelte:window bind:innerHeight />

<div
	class={clsx(
		'flex border-2 rounded-lg flex-col flex-1 scroll-mx-2 overflow-hidden',
		isFocused
			? 'border-blue-500/50 bg-blue-300/50 dark:bg-blue-900'
			: 'bg-base-300 dark:bg-base-100 border-base-300 dark:border-base-100'
	)}
	bind:this={wrapperElement}
>
	<div class="flex items-center justify-between">
		<div class="flex gap-1 items-center px-2">
			{#if tab.external}
				<div
					class={clsx(
						'badge badge-outline badge-xs',
						isFocused ? 'border-blue-500' : 'border-base-300'
					)}
				>
					EXTERNAL
				</div>
			{/if}
			<div class="text-sm">{fileName}</div>
		</div>
		<button
			class="btn btn-square btn-ghost btn-xs"
			onclick={() => workspaceStore.removeTab({ tabId: tab.id })}
		>
			<XIcon size={16} />
		</button>
	</div>
	<div class="flex-1 relative">
		<div
			bind:this={editorElement}
			class={clsx('absolute inset-0 rounded-t-none rounded-b-lg overflow-hidden scroll-mx-2')}
		></div>
	</div>
</div>
