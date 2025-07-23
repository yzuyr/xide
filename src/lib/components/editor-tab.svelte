<script lang="ts">
	import { onMount } from 'svelte';
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import { emit, listen } from '@tauri-apps/api/event';
	import { workspaceStore, type Tab } from '$lib/store/workspace.svelte';
	import { readTextFile, watchImmediate, writeTextFile } from '@tauri-apps/plugin-fs';
	import clsx from 'clsx';
	import { appStore } from '$lib/store/app.svelte';
	import { EXTENSION_TO_LANG } from '$lib/const';
	import { goto } from '$app/navigation';
	import { registerCompletion } from 'monacopilot';
	import { join } from '@tauri-apps/api/path';
	import { watch } from 'runed';
	import { XIcon } from 'lucide-svelte';
	import { configStore } from '$lib/store/config.svelte';
	import { editorStore } from '$lib/store/editor.svelte';
	import pDebounce from 'p-debounce';

	const {
		tab
	}: {
		tab: Tab;
	} = $props();

	let content = $state<string>();
	let position = $state<Monaco.Position>();
	let editor = $state<Monaco.editor.IStandaloneCodeEditor>();
	let editorElement = $state<HTMLElement>();
	let wrapperElement = $state<HTMLElement>();
	let innerHeight = $state(0);
	let disposeEditor = $state<() => void>();
	let isSaving = $state(false);
	let lastSavedContent = $state<string>();
	const isFocused = $derived(tab.id === workspaceStore.currentTabId);
	const row = $derived(workspaceStore.findRowById(tab.rowId));
	const isLastTab = $derived(row?.tabIds[row?.tabIds?.length - 1] === tab.id);

	async function getWorkspacePath(filePath: string) {
		if (!workspaceStore.rootDir) throw new Error('Workspace root directory not found');
		if (tab.external) return filePath;
		return join(workspaceStore.rootDir, filePath);
	}

	async function saveFileContent() {
		if (!editor) return;
		const model = editor.getModel();
		if (!model) return;
		const content = model.getValue();
		isSaving = true;
		lastSavedContent = content;
		try {
			await writeTextFile(await getWorkspacePath(tab.filePath), content);
		} finally {
			// Keep the saving state for a brief moment to catch the file watcher event
			setTimeout(() => {
				isSaving = false;
			}, 100);
		}
	}

	const debouncedSaveFileContent = pDebounce(saveFileContent, 1000);

	function cursorChangeHandler(e: Monaco.editor.ICursorPositionChangedEvent) {
		if (!editor) return;
		const model = editor.getModel();
		if (!model) return;
		position = model.getPositionAt(model.getOffsetAt(e.position));
	}

	async function initializeEditor() {
		if (!editorElement) return;
		if (!editorStore.monaco) return;
		editor = editorStore.monaco.editor.create(editorElement, {
			fontFamily: 'Geist Mono Variable',
			fontSize: configStore.config?.editor.font_size ?? 14,
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
			model: null,
			theme:
				appStore.theme === 'dark'
					? configStore.config.editor.dark_theme
					: configStore.config.editor.light_theme
		});
		editor.onDidFocusEditorWidget(focusHandler);
		editor.onDidFocusEditorText(focusHandler);
		editor.onDidChangeModelContent(debouncedSaveFileContent);
		editor.onDidChangeCursorPosition(cursorChangeHandler);
		editor.createDecorationsCollection();
		editor.addAction({
			id: 'tab-next',
			label: 'Tab Next',
			keybindings: [editorStore.monaco.KeyMod.WinCtrl | editorStore.monaco.KeyCode.KeyL],
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
			keybindings: [editorStore.monaco.KeyMod.WinCtrl | editorStore.monaco.KeyCode.KeyJ],
			async run() {
				if (workspaceStore.chatVisible && row?.tabIds[0] === tab.id) {
					return emit('focus-chat');
				}
				return workspaceStore.prevTab({ tabId: tab.id });
			}
		});
		editor.addAction({
			id: 'row-next',
			label: 'Row Next',
			keybindings: [editorStore.monaco.KeyMod.WinCtrl | editorStore.monaco.KeyCode.KeyK],
			async run() {
				return workspaceStore.nextRow({ rowId: tab.rowId });
			}
		});
		editor.addAction({
			id: 'row-prev',
			label: 'Row Prev',
			keybindings: [editorStore.monaco.KeyMod.WinCtrl | editorStore.monaco.KeyCode.KeyI],
			async run() {
				return workspaceStore.prevRow({ rowId: tab.rowId });
			}
		});
		editor.addAction({
			id: 'command-menu',
			label: 'Command Menu',
			keybindings: [editorStore.monaco.KeyMod.CtrlCmd | editorStore.monaco.KeyCode.KeyK],
			async run() {
				return appStore.toggleCommandMenu();
			}
		});
		editor.addAction({
			id: 'overview',
			label: 'Overview',
			keybindings: [editorStore.monaco.KeyMod.CtrlCmd | editorStore.monaco.KeyCode.KeyL],
			async run() {
				return goto('/');
			}
		});
		editor.addAction({
			id: 'close-tab',
			label: 'Close Tab',
			keybindings: [editorStore.monaco.KeyMod.CtrlCmd | editorStore.monaco.KeyCode.KeyW],
			async run() {
				return workspaceStore.removeTab({ tabId: tab.id });
			}
		});
	}

	async function loadFile() {
		if (!editorStore.monaco) return;
		if (!editor) return;
		if (!workspaceStore.rootDir) return;
		const filePath = await getWorkspacePath(tab.filePath);
		content = await readTextFile(filePath);
		const language =
			EXTENSION_TO_LANG[tab.filePath.split('.').pop() as keyof typeof EXTENSION_TO_LANG] ??
			'text/plain';
		const uri = editorStore.monaco.Uri.file(tab.filePath);
		let model = editorStore.monaco.editor.getModel(uri);
		if (!model) {
			model = editorStore.monaco.editor.createModel(content, language, uri);
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
				theme:
					appStore.theme === 'dark'
						? configStore.config.editor.dark_theme
						: configStore.config.editor.light_theme
			});
		}
	);

	function focusHandler() {
		workspaceStore.setCurrentTabId(tab.id);
		wrapperElement?.scrollIntoView({
			behavior: 'smooth'
		});
		editor?.focus();
	}

	async function init() {
		let unregisterCompletionFn: () => void;
		await initializeEditor();
		if (!editorStore.monaco) return;
		if (!editor) return;
		const language = await loadFile();
		if (!language) return;
		const isEnv = tab.filePath.split('/').pop()?.endsWith('.env');
		if (isEnv) return;
		unregisterCompletionFn = registerCompletion(editorStore.monaco, editor, {
			language,
			async requestHandler({ body }) {
				if (!editorStore.copilot) throw new Error('Copilot not initialized');
				return editorStore.copilot.complete({ body });
			}
		}).deregister;
		if (isFocused) {
			focusHandler();
		}
		return () => {
			editor?.dispose();
			unregisterCompletionFn?.();
		};
	}

	function registerEventListeners() {
		let unlistenFocusFn: () => void;
		let unlistenReloadFn: () => void;
		let unwatchFileChange: () => void;
		listen<{ id: string }>('focus-tab', ({ payload }) => {
			if (payload.id === tab.id) {
				focusHandler();
			}
		}).then((unlisten) => {
			unlistenFocusFn = unlisten;
		});
		listen<{ id: string }>('reload-editor', () => {
			editor?.dispose();
			init().then((disposeFn) => {
				disposeEditor = disposeFn;
			});
		}).then((unlisten) => {
			unlistenReloadFn = unlisten;
		});
		getWorkspacePath(tab.filePath).then((path) => {
			watchImmediate(path, async () => {
				if (!editor) return;
				const newContent = await readTextFile(path);
				if (isSaving) return;
				if (lastSavedContent && newContent === lastSavedContent) return;
				const model = editor.getModel();
				if (!model) return;
				const currentEditorContent = model.getValue();
				if (currentEditorContent === newContent) return;
				content = newContent;
				model.setValue(newContent);
				if (!position) return;
				editor.setPosition(position);
			}).then((unwatch) => {
				unwatchFileChange = unwatch;
			});
		});
		return () => {
			unlistenFocusFn?.();
			unlistenReloadFn?.();
			unwatchFileChange?.();
		};
	}

	onMount(() => {
		let unregisterEventListenersFn: () => void;
		init().then((disposeFn) => {
			disposeEditor = disposeFn;
			unregisterEventListenersFn = registerEventListeners();
		});
		return () => {
			disposeEditor?.();
			unregisterEventListenersFn?.();
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
	<div class="group flex items-center justify-between">
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
			<div class="text-sm">{tab.filePath}</div>
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
