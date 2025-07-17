import { load } from '@tauri-apps/plugin-store';
import { z } from 'zod';

const ChatMessageSchema = z.object({
	id: z.string(),
	role: z.enum(['user', 'assistant']),
	content: z.string()
});

type ChatMessage = z.infer<typeof ChatMessageSchema>;

const ChatSchema = z.object({
	id: z.string(),
	messages: z.array(ChatMessageSchema).default([])
});

type Chat = z.infer<typeof ChatSchema>;

class ChatsStore {
	chats = $state<Chat[]>([]);

	async restore() {
		const store = await load('chats.json');
		this.chats = ChatSchema.array().parse(await store.get('chats'));
	}

	async persist() {
		const store = await load('chats.json');
		await store.set('chats', this.chats);
	}

	async createChat() {
		const chatId = crypto.randomUUID();
		this.chats.push({
			id: chatId,
			messages: []
		});
		await this.persist();
		return chatId;
	}

	async addMessage(chatId: string, message: ChatMessage) {
		const chatIndex = this.chats.findIndex((chat) => chat.id === chatId);
		this.chats[chatIndex].messages.push(message);
		await this.persist();
		return this.chats[chatIndex].messages.length - 1;
	}

	async appendToMessage({
		chatId,
		messageId,
		content
	}: {
		chatId: string;
		messageId: string;
		content: string;
	}) {
		const chatIndex = this.chats.findIndex((chat) => chat.id === chatId);
		const messageIndex = this.chats[chatIndex].messages.findIndex(
			(message) => message.id === messageId
		);
		this.chats[chatIndex].messages[messageIndex].content += content;
		await this.persist();
	}

	async deleteChat(chatId: string) {
		this.chats = this.chats.filter((chat) => chat.id !== chatId);
		await this.persist();
	}

	async deleteMessage(chatId: string, messageId: string) {
		const chatIndex = this.chats.findIndex((chat) => chat.id === chatId);
		this.chats[chatIndex].messages = this.chats[chatIndex].messages.filter(
			(message) => message.id !== messageId
		);
		await this.persist();
	}
}

export const chatsStore = new ChatsStore();
