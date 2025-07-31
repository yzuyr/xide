<script lang="ts">
	import { onMount } from 'svelte';
	import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import { emit, listen } from '@tauri-apps/api/event';
	import { workspaceStore, type Tab } from '$lib/store/workspace.svelte';
	import { readTextFile, watchImmediate, writeTextFile } from '@tauri-apps/plugin-fs';
	import clsx from 'clsx';
	import { appStore } from '$lib/store/app.svelte';
	import { EXTENSION_TO_LANG } from '$lib/const';
	import { registerCompletion } from 'monacopilot';
	import { join } from '@tauri-apps/api/path';
	import { watch } from 'runed';
	import { XIcon } from 'lucide-svelte';
	import { configStore } from '$lib/store/config.svelte';
	import { editorStore } from '$lib/store/editor.svelte';
	import pDebounce from 'p-debounce';
	import { SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { Menu } from '@tauri-apps/api/menu';

	const {
		tab
	}: {
		tab: Tab;
	} = $props();

	let content = $state<string>();
	let position = $state<Monaco.Position>();
	let editor = $state<Monaco.editor.IStandaloneCodeEditor>();
	let editorElement = $state<HTMLElement>();
	let innerHeight = $state(0);
	let disposeEditor = $state<() => void>();
	let isSaving = $state(false);
	let lastSavedContent = $state<string>();
	let saveTimeout = $state<number>();
	const isFocused = $derived(tab.id === workspaceStore.currentTabId);
	const row = $derived(workspaceStore.findRowById(tab.rowId));
	const isLastTab = $derived(
		Array.from(row?.tabIds ?? new SvelteSet<string>())[(row?.tabIds?.size ?? 0) - 1] === tab.id
	);

	async function getWorkspacePath(filePath: string) {
		if (tab.external) return filePath;
		if (!workspaceStore.rootDir) throw new Error('Workspace root directory not found');
		return join(workspaceStore.rootDir, filePath);
	}

	async function saveFileContent(content: string) {
		isSaving = true;
		lastSavedContent = content;
		try {
			await writeTextFile(await getWorkspacePath(tab.filePath), content);
		} finally {
			// Increase timeout for larger directories where file operations are slower
			setTimeout(() => {
				isSaving = false;
			}, 300);
		}
	}

	const debouncedSaveFileContent = pDebounce(saveFileContent, 1000);

	function changeContentHandler(e: Monaco.editor.IModelContentChangedEvent) {
		if (!editor) return;
		const model = editor.getModel();
		if (!model) return;
		content = model.getValue();
	}

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
		editor.onDidChangeModelContent(changeContentHandler);
		editor.onDidChangeCursorPosition(cursorChangeHandler);
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
				if (
					workspaceStore.chatVisible &&
					Array.from(row?.tabIds ?? new SvelteSet<string>())[0] === tab.id
				) {
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
				return workspaceStore.nextRow();
			}
		});
		editor.addAction({
			id: 'row-prev',
			label: 'Row Prev',
			keybindings: [editorStore.monaco.KeyMod.WinCtrl | editorStore.monaco.KeyCode.KeyI],
			async run() {
				return workspaceStore.prevRow();
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
				workspaceStore.toggleExplorer();
				if (workspaceStore.explorerVisible) return;
				return focusHandler();
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
		editor.addAction({
			id: 'toggle-chat',
			label: 'Toggle Chat',
			keybindings: [editorStore.monaco.KeyMod.CtrlCmd | editorStore.monaco.KeyCode.KeyI],
			async run() {
				workspaceStore.toggleChat();
				if (workspaceStore.chatVisible) {
					return emit('focus-chat');
				}
				return focusHandler();
			}
		});
	}

	async function loadFile() {
		if (!editorStore.monaco) return;
		if (!editor) return;
		const filePath = await getWorkspacePath(tab.filePath);
		const language =
			EXTENSION_TO_LANG[tab.filePath.split('.').pop() as keyof typeof EXTENSION_TO_LANG] ??
			'text/plain';
		const uri = editorStore.monaco.Uri.file(tab.filePath);
		let model = editorStore.monaco.editor.getModel(uri);
		if (!model) {
			content = await readTextFile(filePath);
			model = editorStore.monaco.editor.createModel(content, language, uri);
		}
		editor.setModel(model);
		const cursorPosition = page.url.searchParams.get('position');
		if (cursorPosition) {
			const positionObject = JSON.parse(cursorPosition);
			position = new editorStore.monaco.Position(positionObject.lineNumber, positionObject.column);
			editor.setPosition(position);
			editor.revealLine(position.lineNumber);
		}
		return language;
	}

	async function createContextMenu(event: MouseEvent) {
		event.preventDefault();
		const menu = await Menu.new({ items: [{ id: 'close-tab', text: 'Close Tab' }] });
		menu.popup();
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

	watch(
		() => content,
		(value, previousValue) => {
			if (!value) return;
			if (value === previousValue) return;

			// Clear existing timeout to debounce saves
			if (saveTimeout) {
				clearTimeout(saveTimeout);
			}

			// Debounce file saves to prevent excessive I/O in large directories
			saveTimeout = setTimeout(() => {
				debouncedSaveFileContent(value);
			}, 150) as any;
		}
	);

	watch(
		() => workspaceStore.currentTabId,
		(tabId) => {
			if (!editor) return;
			if (!tabId) return;
			if (tabId !== tab.id) return;
			emit('scroll-to-tab', { tabId });
			editor.focus();
		}
	);

	watch(
		() => workspaceStore.chatVisible,
		(visible) => {
			if (visible) return;
			if (tab.id !== workspaceStore.currentTabId) return;
			focusHandler();
		}
	);

	function focusHandler() {
		workspaceStore.setCurrentTabId(tab.id);
	}

	async function init() {
		try {
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
			return () => {
				editor?.dispose();
				unregisterCompletionFn?.();
			};
		} catch (error) {
			console.error('Editor initialization failed:', error);
			// Return a cleanup function even if initialization fails
			return () => {
				editor?.dispose();
			};
		}
	}

	function registerEventListeners() {
		let unlistenReloadFn: () => void;
		let unwatchFileChange: () => void;
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

				// Skip if we're currently saving to prevent race conditions
				if (isSaving) return;

				try {
					const newContent = await readTextFile(path);

					// More robust content comparison
					if (lastSavedContent && newContent === lastSavedContent) return;

					const model = editor.getModel();
					if (!model) return;

					const currentEditorContent = model.getValue();
					if (currentEditorContent === newContent) return;

					// Only update if content actually differs and we're not in a save cycle
					if (content !== newContent) {
						content = newContent;
						model.setValue(newContent);
						if (position) {
							editor.setPosition(position);
						}
					}
				} catch (error) {
					// Silently handle file read errors to prevent crashes
					console.warn('File watcher read error:', error);
				}
			}).then((unwatch) => {
				unwatchFileChange = unwatch;
			});
		});
		return () => {
			unlistenReloadFn?.();
			unwatchFileChange?.();
		};
	}

	onMount(() => {
		let unregisterEventListenersFn: () => void;
		init().then((disposeFn) => {
			disposeEditor = disposeFn;
			unregisterEventListenersFn = registerEventListeners();
			console.log('mnt', tab, workspaceStore.currentTabId);
			if (tab.id === workspaceStore.currentTabId) {
				focusHandler();
				emit('scroll-to-tab', { tabId: tab.id });
			}
		});
		return () => {
			// Clear any pending save timeout
			if (saveTimeout) {
				clearTimeout(saveTimeout);
			}
			disposeEditor?.();
			unregisterEventListenersFn?.();
		};
	});
</script>

<svelte:window bind:innerHeight />

<div
	class={clsx(
		'flex flex-col flex-1 overflow-hidden border-r-2 border-base-300',
		isFocused ? 'bg-primary' : 'bg-base-300 dark:bg-base-100'
	)}
>
	<div
		class={clsx('group flex items-center justify-between', isFocused && 'text-primary-content')}
		oncontextmenu={createContextMenu}
		role="tab"
		tabindex={0}
	>
		<div class="flex gap-1 items-center px-2">
			{#if tab.external}
				<div
					class={clsx(
						'badge badge-outline badge-xs',
						isFocused ? 'border-primary-500' : 'border-base-300'
					)}
				>
					EXTERNAL
				</div>
			{/if}
			<div class="text-sm">{tab.filePath}</div>
		</div>
		<button
			type="button"
			class="btn btn-square btn-ghost btn-xs"
			onclick={() => workspaceStore.removeTab({ tabId: tab.id })}
		>
			<XIcon size={16} />
		</button>
	</div>
	<div class="flex-1 relative">
		<div bind:this={editorElement} class={clsx('absolute inset-0 overflow-hidden')}></div>
	</div>
</div>
