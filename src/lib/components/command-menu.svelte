<script lang="ts">
	import { appStore } from '$lib/store/app.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { shortcut } from '@svelte-put/shortcut';
	import { createForm } from 'felte';
	import { matchSorter } from 'match-sorter';
	import clsx from 'clsx';
	import { watch, resource } from 'runed';
	import { match, P } from 'ts-pattern';
	import CodeHighlighter from './code-highlighter.svelte';
	import { join } from '@tauri-apps/api/path';
	import { exists, mkdir, readDir, readTextFile, stat, writeTextFile } from '@tauri-apps/plugin-fs';
	import { GARBAGE_FILES } from '$lib/const';
	import { goto } from '$app/navigation';
	import { ChevronRightIcon, DotIcon, FileIcon, FolderIcon, SearchIcon } from 'lucide-svelte';
	import { trapFocus } from 'trap-focus-svelte';
	import z from 'zod';
	import { editorStore, RangeSchema } from '$lib/store/editor.svelte';

	let inputElement = $state<HTMLInputElement>();

	const { form, data, setFields } = $derived(
		createForm({
			async onSubmit() {
				return executeCommand(activeCommand);
			},
			initialValues: {
				query: ''
			}
		})
	);

	const ExecutableCommandSchema = z.object({
		label: z.string(),
		type: z.enum(['command', 'file', 'directory']),
		value: z.string(),
		meta: z
			.object({ opened: z.boolean().default(false), range: RangeSchema.optional() })
			.default({ opened: false })
			.optional()
	});

	type ExecutableCommand = z.infer<typeof ExecutableCommandSchema>;

	const BASE_COMMANDS: ExecutableCommand[] = [
		{
			label: 'Toggle Chat',
			value: 'toggle_chat',
			type: 'command'
		},
		{
			label: 'Settings',
			value: 'settings',
			type: 'command'
		},
		{
			label: 'Exit',
			value: 'exit',
			type: 'command'
		}
	];

	const fileCommands: ExecutableCommand[] = $derived(
		workspaceStore.fileList.map((file) => {
			return {
				label: file,
				value: file,
				type: 'file',
				meta: {
					opened: !!workspaceStore.findTabByPath(file)
				}
			};
		})
	);

	const dirCommands: ExecutableCommand[] = $derived(
		workspaceStore.dirList.map((dir) => {
			return {
				label: dir,
				value: dir,
				type: 'directory'
			};
		})
	);

	const searchResults = $derived($data.query?.length > 2 ? editorStore.search($data.query) : []);

	const searchCommands: ExecutableCommand[] = $derived(
		searchResults.map((result) => {
			return {
				label: result.path,
				value: result.path,
				type: 'file',
				meta: { opened: false, range: result.range }
			};
		})
	);

	const metaCommands: ExecutableCommand[] = $derived(
		$data.query && !workspaceStore.fileList.includes($data.query)
			? [
					{ label: 'Create File', value: 'create_file', type: 'command' },
					{ label: 'Create Directory', value: 'create_dir', type: 'command' }
				]
			: []
	);

	const combinedCommands: ExecutableCommand[] = $derived([...fileCommands, ...dirCommands]);

	const filteredCommands: ExecutableCommand[] = $derived(
		$data.query
			? matchSorter(combinedCommands, $data.query, {
					keys: ['label', 'value']
				})
			: combinedCommands.sort((a, b) => {
					return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
				})
	);

	const allCommands: ExecutableCommand[] = $derived([
		...searchCommands,
		...filteredCommands,
		...metaCommands,
		...BASE_COMMANDS
	]);

	const activeCommand = $derived(allCommands[appStore.currentCommandIndex]);

	async function executeCommand(command: ExecutableCommand) {
		return match(command)
			.with({ type: 'file' }, ({ value, meta }) => {
				if (!workspaceStore.currentRowId) return;
				const initialPosition = meta?.range
					? {
							lineNumber: meta.range.startLineNumber,
							column: meta.range.startColumn
						}
					: undefined;
				workspaceStore.addTab({
					rowId: workspaceStore.currentRowId,
					filePath: value,
					initialPosition
				});
				appStore.setCommandMenuOpen(false);
				return goto(`/rows/${workspaceStore.currentRowId}`);
			})
			.with({ type: 'directory' }, async ({ value }) => {
				if (!workspaceStore.currentRowId) return;
				if (!workspaceStore.rootDir) return;
				const fullDir = await join(workspaceStore.rootDir, value);
				const entries = await readDir(fullDir);
				const files = entries.filter(
					(entry) => !entry.isDirectory && !GARBAGE_FILES.includes(entry.name)
				);
				for (const file of files) {
					workspaceStore.addTab({
						rowId: workspaceStore.currentRowId,
						filePath: await join(value, file.name)
					});
				}
				appStore.setCommandMenuOpen(false);
				return goto(`/rows/${workspaceStore.currentRowId}`);
			})
			.with({ type: 'command' }, async ({ value }) => {
				if (value === 'create_file') {
					if (!workspaceStore.rootDir) return;
					if (!workspaceStore.currentRowId) return;
					const path = await join(workspaceStore.rootDir, $data.query);
					const pathDirectory = path.split('/').slice(0, -1).join('/');
					const directoryExists = await exists(pathDirectory);
					if (!directoryExists) {
						await mkdir(pathDirectory, { recursive: true });
					}
					await writeTextFile(path, '');
					const tabId = workspaceStore.addTab({
						rowId: workspaceStore.currentRowId,
						filePath: $data.query
					});
					appStore.setCommandMenuOpen(false);
					workspaceStore.setCurrentTabId(tabId);
					return goto(`/rows/${workspaceStore.currentRowId}`);
				}
				if (value === 'create_dir') {
					if (!workspaceStore.rootDir) return;
					if (!workspaceStore.currentRowId) return;
					const path = await join(workspaceStore.rootDir, $data.query);
					const directoryExists = await exists(path);
					if (directoryExists) return;
					await mkdir(path, { recursive: true });
					appStore.setCurrentCommandIndex(0);
					await workspaceStore.buildFileList();
					setFields({ query: '' });
				}
			})
			.otherwise(() => {});
	}

	async function fetchPanelContent(activeCommand: ExecutableCommand) {
		return match(activeCommand)
			.with({ type: 'file' }, async ({ value }) => {
				if (!workspaceStore.rootDir) return;
				const fullPath = await join(workspaceStore.rootDir, value);
				try {
					const meta = await stat(fullPath);
					if (meta.size > 20000) {
						return {
							type: 'file',
							data: 'File is too large to display'
						};
					}
					const content = await readTextFile(fullPath);
					return {
						type: 'file',
						data: content
					};
				} catch (e) {
					return {
						type: 'file',
						data: ''
					};
				}
			})
			.with({ type: 'directory' }, async ({ value }) => {
				if (!workspaceStore.rootDir) return;
				const fullPath = await join(workspaceStore.rootDir, value);
				const entries = await readDir(fullPath);
				const files = entries
					.filter((entry) => !entry.isDirectory && !GARBAGE_FILES.includes(entry.name))
					.map((entry) => entry.name);
				return {
					type: 'directory',
					data: files
				};
			})
			.otherwise(async () => {
				return {
					type: 'file',
					data: ''
				};
			});
	}

	const panelResource = resource(
		() => activeCommand,
		async () => {
			return fetchPanelContent(activeCommand);
		}
	);

	function getElementByIndex(index: number) {
		return document.querySelector(`[data-command-index="${index}"]`) as HTMLButtonElement;
	}

	function commandUp() {
		const newIndex = appStore.currentCommandIndex - 1;
		if (newIndex >= 0) {
			appStore.setCurrentCommandIndex(newIndex);
			return getElementByIndex(newIndex)?.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest'
			});
		}
		appStore.setCurrentCommandIndex(allCommands.length - 1);
		return getElementByIndex(allCommands.length - 1)?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest'
		});
	}

	function commandDown() {
		const newIndex = appStore.currentCommandIndex + 1;
		if (newIndex < allCommands.length) {
			appStore.setCurrentCommandIndex(newIndex);
			return getElementByIndex(newIndex)?.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest'
			});
		}
		appStore.setCurrentCommandIndex(0);
		return getElementByIndex(0)?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest'
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		return match(event)
			.with({ key: 'Escape' }, () => {
				event.preventDefault();
				return appStore.setCommandMenuOpen(false);
			})
			.with(P.union({ key: 'ArrowDown' }, { key: 'k', ctrlKey: true }), () => {
				event.preventDefault();
				commandDown();
			})
			.with(P.union({ key: 'ArrowUp' }, { key: 'i', ctrlKey: true }), () => {
				event.preventDefault();
				commandUp();
			})
			.otherwise(() => {});
	}

	watch(
		() => $data.query,
		() => {
			appStore.setCurrentCommandIndex(0);
		}
	);

	$effect(() => {
		if (!appStore.commandMenuOpen) return;
		appStore.setCurrentCommandIndex(0);
		workspaceStore.buildFileList();
	});
</script>

<svelte:window
	use:shortcut={{
		trigger: [{ key: 'Escape', callback: () => appStore.setCommandMenuOpen(false) }]
	}}
/>

{#if appStore.commandMenuOpen}
	<form use:form use:trapFocus class="modal modal-open">
		<div class="modal-box max-w-[720px] max-h-[440px] h-full w-full p-0 flex">
			<div class="flex flex-col flex-1">
				<label class="input w-full border-x-0 border-t-0 !outline-none rounded-none">
					<input
						name="query"
						class="!outline-none"
						onkeydown={handleKeyDown}
						autocomplete="off"
						spellcheck="false"
						bind:this={inputElement}
					/>
				</label>
				<div class="flex-1 overflow-y-auto">
					<ul class="menu w-full">
						{#each allCommands as command, index}
							<li>
								<button
									type="button"
									data-command-index={index}
									class={clsx(
										'scroll-my-2',
										appStore.currentCommandIndex === index && 'menu-active'
									)}
									onclick={(event) => event.detail !== 0 && executeCommand(command)}
								>
									{#if command.type === 'file'}
										{#if command.meta?.range}
											<SearchIcon size={16} />
										{:else}
											<FileIcon size={16} />
										{/if}
									{:else if command.type === 'directory'}
										<FolderIcon size={16} />
									{:else if command.type === 'command'}
										<ChevronRightIcon size={16} />
									{/if}
									<span class="truncate flex-1">{command.label}</span>
									{#if command.meta?.opened}
										<DotIcon size={20} />
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			</div>
			<div class="flex flex-col flex-1 border-l border-base-content/10">
				{#if panelResource.loading}
					<div></div>
				{:else if panelResource.current?.type === 'file'}
					<CodeHighlighter
						path={activeCommand.value}
						code={panelResource.current?.data as string}
						range={activeCommand.meta?.range}
					/>
				{:else if panelResource.current?.type === 'directory'}
					<ul class="menu bg-base-100 w-full">
						{#each panelResource.current?.data ?? [] as file}
							<li><button><FileIcon size={16} /><span class="truncate">{file}</span></button></li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop"
			onclick={() => appStore.toggleCommandMenu()}
			aria-label="Close"
			data-tauri-drag-region
		></button>
	</form>
{/if}
