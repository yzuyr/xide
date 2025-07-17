<script lang="ts">
	import { chatsStore } from '$lib/store/chats.svelte';
	import { invoke, Channel } from '@tauri-apps/api/core';
	import { createForm } from 'felte';
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import { emit, listen } from '@tauri-apps/api/event';
	import { workspaceStore } from '$lib/store/workspace.svelte';

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
					console.log('Agent output:', data.line);
					await chatsStore.appendToMessage({
						chatId,
						messageId: chat.messages[messageIndex].id,
						content: data.line
					});
					// Handle stdout line
					break;
				// case "stderr":
				//   console.error("Agent error:", data.line);
				//   // Handle stderr line
				//   break;
				case 'finished':
					console.log('Agent finished, success:', data.success);
					// Handle completion
					break;
				// case "error":
				//   console.error("Agent error:", data.message);
				//   // Handle error
				//   break;
			}
		};

		try {
			await invoke('run_agent', {
				model,
				prompt,
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
			const lastTabIndex = currentRow.tabs.length - 1;
			return emit(`focus-tab-${lastTabIndex}`);
		}
		if (event.key === 'l' && event.ctrlKey) {
			event.preventDefault();
			return emit('focus-tab-0');
		}
	}

	function onInputFocus() {
		return formElement?.scrollIntoView({
			behavior: 'smooth'
		});
	}

	onMount(() => {
		let unlistenFocusFn: () => void;
		chatsStore.restore();
		formElement?.scrollIntoView({
			behavior: 'smooth'
		});
		listen('focus-chat', () => {
			formElement?.scrollIntoView({
				behavior: 'smooth'
			});
			inputElement?.focus();
		}).then((unlisten) => {
			unlistenFocusFn = unlisten;
		});
		return () => {
			chatsStore.persist();
			unlistenFocusFn?.();
		};
	});
</script>

<form use:form bind:this={formElement} class="flex flex-col flex-1 bg-base-200 gap-1 scroll-mx-2">
	<div class="flex flex-col flex-1 bg-base-100 p-2 rounded-lg border-2 border-base-300">
		{#each chat?.messages ?? [] as message}
			{#if message.role === 'user'}
				<div class="chat chat-end">
					<div class="chat-bubble text-sm">{message.content}</div>
				</div>
			{:else}
				{@const htmlContent = marked(message.content)}
				<div class="prose prose-sm">{@html htmlContent}</div>
			{/if}
		{/each}
		{#if isRunning}
			<span class="loading loading-ball"></span>
		{/if}
	</div>
	<input
		name="prompt"
		class="input w-full !outline-none border-2 border-base-300 focus:border-blue-500/50 rounded-lg"
		onfocus={onInputFocus}
		onkeydown={handleKeyDown}
		bind:this={inputElement}
	/>
</form>
