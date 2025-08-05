<script lang="ts">
	import { chatsStore } from '$lib/store/chats.svelte';
	import { invoke, Channel } from '@tauri-apps/api/core';
	import { createForm } from 'felte';
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import { emit, listen } from '@tauri-apps/api/event';
	import { workspaceStore } from '$lib/store/workspace.svelte';
	import { ExternalLinkIcon, XIcon } from 'lucide-svelte';

	let chatId = $state<string>();
	const chat = $derived(chatsStore.chats.find((chat) => chat.id === chatId));
	let isRunning = $state(false);
	let formElement = $state<HTMLFormElement>();
	let inputElement = $state<HTMLInputElement>();

	async function runAgent({ model, prompt }: { model: string; prompt: string }) {
		if (!chatId) return;

		const onEvent = new Channel<{
			event: 'stdout' | 'stderr' | 'finished' | 'error';
			data: any;
		}>();

		const messageIndex = await chatsStore.addMessage(chatId, {
			id: crypto.randomUUID(),
			role: 'assistant',
			content: ''
		});

		onEvent.onmessage = async (message) => {
			if (!chatId) return;
			if (!chat) return;
			const { event, data } = message;
			switch (event) {
				case 'stdout':
					await chatsStore.appendToMessage({
						chatId,
						messageId: chat.messages[messageIndex].id,
						content: data.line
					});
					break;
				case 'finished':
					break;
			}
		};

		try {
			await invoke('run_agent', {
				model,
				prompt,
				cwd: workspaceStore.rootDir ?? '',
				onEvent
			});
		} catch (error) {
			console.error('Failed to run agent:', error);
		}
	}

	const { form, setFields } = createForm({
		async onSubmit({ prompt }) {
			setFields({ prompt: '' });
			if (!chatId) {
				chatId = await chatsStore.createChat();
			}
			await chatsStore.addMessage(chatId, {
				id: crypto.randomUUID(),
				role: 'user',
				content: prompt
			});
			isRunning = true;
			try {
				await runAgent({
					model: 'github-copilot/gpt-4.1',
					prompt: prompt
				});
			} finally {
				isRunning = false;
			}
		},
		initialValues: {
			prompt: ''
		}
	});

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'j' && event.ctrlKey) {
			event.preventDefault();
			if (!workspaceStore.currentRowId) return;
			const currentRow = workspaceStore.findRowById(workspaceStore.currentRowId);
			if (!currentRow) return;
			const lastTabIndex = currentRow.tabIds.size - 1;
			return workspaceStore.setCurrentTabId(Array.from(currentRow.tabIds)[lastTabIndex]);
		}
		if (event.key === 'l' && event.ctrlKey) {
			event.preventDefault();
			if (!workspaceStore.currentRowId) return;
			const currentRow = workspaceStore.findRowById(workspaceStore.currentRowId);
			if (!currentRow) return;
			return workspaceStore.setCurrentTabId(Array.from(currentRow.tabIds)[0]);
		}
	}

	function onInputFocus() {
		return formElement?.scrollIntoView({
			behavior: 'smooth'
		});
	}

	function closeChat() {
		workspaceStore.setChatVisible(false);
	}

	onMount(() => {
		let unlistenFocusFn: () => void;
		chatsStore.restore();
		formElement?.scrollIntoView({
			behavior: 'smooth'
		});
		listen('focus-chat', () => {
			inputElement?.focus();
			setTimeout(() => {
				formElement?.scrollIntoView({
					behavior: 'smooth',
					inline: 'end',
					block: 'end'
				});
			}, 20);
		}).then((unlisten) => {
			unlistenFocusFn = unlisten;
		});
		return () => {
			chatsStore.persist();
			unlistenFocusFn?.();
		};
	});
</script>

<form use:form bind:this={formElement} class="h-screen flex flex-col flex-1 shrink-0 bg-base-100">
	<div
		class="flex items-center justify-between bg-base-200 p-1 border-b-2 border-base-300"
		data-tauri-drag-region
	>
		<a
			href="https://opencode.ai"
			target="_blank"
			rel="noopener noreferrer"
			class="text-sm ml-2 link flex-1 flex items-center gap-1"
		>
			<span>opencode</span>
			<ExternalLinkIcon size={12} />
		</a>
		<button type="button" class="btn btn-square btn-ghost btn-xs" onclick={closeChat}>
			<XIcon size={16} />
		</button>
	</div>
	<div class="flex flex-1 flex-col p-2 overflow-y-auto">
		{#each chat?.messages ?? [] as message}
			{#if message.role === 'user'}
				<div class="chat chat-end">
					<div class="chat-bubble text-sm">{message.content}</div>
				</div>
			{:else}
				{@const htmlContent = marked(message.content)}
				{#if message.content === '.'}
					<div class="badge badge-success">Done</div>
				{:else}
					<div class="prose prose-sm">{@html htmlContent}</div>
				{/if}
			{/if}
		{/each}
		{#if isRunning}
			<span class="loading loading-ball"></span>
		{/if}
	</div>
	<div class="px-1 pb-1">
		<input
			name="prompt"
			class="input w-full border-2 border-base-300 focus:border-primary !outline-none rounded-lg"
			onfocus={onInputFocus}
			onkeydown={handleKeyDown}
			placeholder="Plan and build with opencode"
			bind:this={inputElement}
		/>
	</div>
</form>
