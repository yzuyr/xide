<script lang="ts">
	import { appStore } from '$lib/store/app.svelte';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { shortcut } from '@svelte-put/shortcut';
	import { createForm } from 'felte';
	import { matchSorter } from 'match-sorter';
	import clsx from 'clsx';
	import { watch } from 'runed';
	import { match } from 'ts-pattern';
	import CodeHighlighter from './code-highlighter.svelte';
	import { join } from '@tauri-apps/api/path';
	import { readTextFile, stat } from '@tauri-apps/plugin-fs';
	import { createQuery } from '@tanstack/svelte-query';
	import { createHighlighter } from 'shiki';
	import { onDestroy } from 'svelte';
	import { SHIKI_LANGUAGES } from '$lib/const';
	import { goto } from '$app/navigation';

	let inputElement = $state<HTMLInputElement>();

	const { form, data } = $derived(
		createForm({
			async onSubmit() {
				return executeCommand(activeCommand);
			},
			initialValues: {
				query: ''
			}
		})
	);

	type ExecutableCommand = {
		label: string;
		type: 'command' | 'file' | 'directory';
		value: string;
	};

	const BASE_COMMANDS: ExecutableCommand[] = [
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
				type: 'file'
			};
		})
	);

	const combinedCommands: ExecutableCommand[] = $derived([...fileCommands, ...BASE_COMMANDS]);

	const filteredCommands: ExecutableCommand[] = $derived(
		$data.query
			? matchSorter(combinedCommands, $data.query, {
					keys: ['label', 'value']
				})
			: combinedCommands
	);

	const activeCommand = $derived(filteredCommands[appStore.currentCommandIndex]);

	async function executeCommand(command: ExecutableCommand) {
		return match(command)
			.with({ type: 'file' }, ({ value }) => {
				if (!workspaceStore.currentRowId) return;
				const tabId = workspaceStore.addTab({
					rowId: workspaceStore.currentRowId,
					filePath: value
				});
				appStore.setCommandMenuOpen(false);
				return goto(`/rows/${workspaceStore.currentRowId}?tabId=${tabId}`);
			})
			.otherwise(() => {});
	}

	async function buildHighligher() {
		return createHighlighter({
			themes: ['houston', 'min-light'],
			langs: SHIKI_LANGUAGES
		});
	}

	async function fetchPanelContent() {
		return match(activeCommand)
			.with({ type: 'file' }, async ({ value }) => {
				if (!workspaceStore.rootDir) return;
				const fullPath = await join(workspaceStore.rootDir, value);
				try {
					const meta = await stat(fullPath);
					console.log('>>>META', meta);
					if (meta.size > 20000) {
						return 'File is too large to display';
					}
					const content = await readTextFile(fullPath);
					return content;
				} catch (e) {
					return '';
				}
			})
			.otherwise(async () => '');
	}

	const highlighterQuery = $derived(
		createQuery({
			queryKey: ['highlighter'],
			queryFn: buildHighligher,
			staleTime: Infinity
		})
	);

	const panelQuery = $derived(
		createQuery({
			queryKey: [
				'panel',
				$data.query,
				activeCommand.value,
				activeCommand.type,
				$highlighterQuery.isLoading
			],
			queryFn: fetchPanelContent,
			enabled: appStore.commandMenuOpen && !$highlighterQuery.isLoading
		})
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
		appStore.setCurrentCommandIndex(filteredCommands.length - 1);
		return getElementByIndex(filteredCommands.length - 1)?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest'
		});
	}

	function commandDown() {
		const newIndex = appStore.currentCommandIndex + 1;
		if (newIndex < filteredCommands.length) {
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
		if (event.key === 'Escape') {
			return appStore.setCommandMenuOpen(false);
		}
		if (event.key === 'ArrowDown') {
			return commandDown();
		}
		if (event.key === 'ArrowUp') {
			return commandUp();
		}
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
		setTimeout(() => {
			inputElement?.focus();
		}, 100);
	});

	onDestroy(() => {
		$highlighterQuery.data?.dispose();
	});
</script>

<svelte:window
	use:shortcut={{
		trigger: [{ key: 'Escape', callback: () => appStore.setCommandMenuOpen(false) }]
	}}
/>

{#if appStore.commandMenuOpen}
	<form use:form class="modal modal-open">
		<div class="modal-box max-w-[720px] max-h-[440px] h-full w-full p-0 flex">
			<div class="flex flex-col flex-1">
				<label class="input w-full rounded-t-lg border-x-0 border-t-0 rounded-b-none !outline-none">
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
						{#each filteredCommands as command, index}
							<li>
								<button
									data-command-index={index}
									class={clsx(
										'scroll-my-2',
										appStore.currentCommandIndex === index && 'menu-active'
									)}
									onclick={(event) => event.detail !== 0 && executeCommand(command)}
									><span dir="rtl" class="truncate">{command.label}</span></button
								>
							</li>
						{/each}
					</ul>
				</div>
			</div>
			<div class="flex flex-col flex-1 border-l border-base-content/10">
				{#if $panelQuery.isLoading}
					<p>Loading</p>
				{:else if $highlighterQuery.data && $panelQuery.data}
					<CodeHighlighter
						highlighter={$highlighterQuery.data}
						path={activeCommand.value}
						code={$panelQuery.data}
					/>
				{/if}
			</div>
		</div>
		<button class="modal-backdrop" onclick={() => appStore.toggleCommandMenu()} aria-label="Close"
		></button>
	</form>
{/if}
