import { goto } from '$app/navigation';
import { BASE_IGNORE_LIST } from '$lib/const';
import { emit } from '@tauri-apps/api/event';
import { join, homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import fastIgnore from 'fast-ignore';

export type Tab = {
	id: string;
	rowId: string;
	filePath: string;
	external: boolean;
};

export type Row = {
	id: string;
	tabs: Tab[];
};

class WorkspaceStore {
	rootDir = $state<string>();
	currentTabId = $state<string>();
	currentRowId = $state<string>();
	rows = $state<Row[]>([]);
	fileList = $state<string[]>([]);
	chatVisible = $state<boolean>(false);

	constructor() {
		if (this.rows.length === 0) {
			const newRow = this.addRow();
			this.setCurrentRowId(newRow.id);
		}
	}

	setRootDir(rootDir: string) {
		this.rootDir = rootDir;
	}

	setChatVisible(visible: boolean) {
		this.chatVisible = visible;
	}

	toggleChat() {
		this.setChatVisible(!this.chatVisible);
		if (!this.chatVisible) return;
		setTimeout(() => {
			emit('focus-chat');
		}, 100);
	}

	setCurrentTabId(tabId: string | undefined) {
		this.currentTabId = tabId;
	}

	setCurrentRowId(rowId: string) {
		this.currentRowId = rowId;
	}

	findRowById(id: string) {
		return this.rows.find((row) => row.id === id);
	}

	findTabByPath(filePath: string) {
		return this.rows.flatMap((row) => row.tabs).find((tab) => tab.filePath === filePath);
	}

	findTabById(id: string) {
		return this.rows.flatMap((row) => row.tabs).find((tab) => tab.id === id);
	}

	removeRow(rowId: string) {
		this.rows = this.rows.filter((row) => row.id !== rowId);
	}

	addRow() {
		this.rows.push({ id: crypto.randomUUID(), tabs: [] });
		return this.rows[this.rows.length - 1];
	}

	addTab({
		rowId,
		filePath,
		external = false
	}: {
		rowId: string;
		filePath: string;
		external?: boolean;
	}) {
		const id = crypto.randomUUID();
		const rowIndex = this.rows.findIndex((row) => row.id === rowId);
		this.rows[rowIndex].tabs.push({ id, rowId, filePath, external });
		this.currentTabId = id;
		return id;
	}

	removeTab({ tabId }: { tabId: string }) {
		const tab = this.findTabById(tabId);
		if (!tab?.rowId) return;
		const rowIndex = this.rows.findIndex((row) => row.id === tab?.rowId);
		if (rowIndex === -1) return;
		console.log('>>>REMOVE TAB', rowIndex, this.rows[rowIndex]);
		this.rows[rowIndex].tabs = this.rows[rowIndex].tabs.filter((tab) => tab.id !== tabId);
		if (this.rows[rowIndex].tabs.length === 0) {
			this.removeRow(tab?.rowId);
		}
	}

	nextTab({ tabId }: { tabId: string }) {
		const currentTab = this.findTabById(tabId);
		if (!currentTab?.rowId) return;
		const row = this.findRowById(currentTab.rowId);
		if (!row) return;
		const currentTabIndex = row.tabs.findIndex((tab) => tab.id === tabId);
		const nextTabIndex = currentTabIndex + 1;
		if (row.tabs.length > nextTabIndex) {
			return emit('focus-tab', { id: row.tabs[nextTabIndex].id });
		}
		const firstTabId = row.tabs[0].id;
		return emit('focus-tab', { id: firstTabId });
	}

	prevTab({ tabId }: { tabId: string }) {
		const currentTab = this.findTabById(tabId);
		if (!currentTab?.rowId) return;
		const row = this.findRowById(currentTab.rowId);
		if (!row) return;
		const currentTabIndex = row.tabs.findIndex((tab) => tab.id === tabId);
		const prevTabIndex = currentTabIndex - 1;
		if (prevTabIndex >= 0) {
			return emit('focus-tab', { id: row.tabs[prevTabIndex].id });
		}
		const lastTabId = row.tabs[row.tabs.length - 1].id;
		return emit('focus-tab', { id: lastTabId });
	}

	async nextRow({ rowId }: { rowId: string }) {
		const currentRow = this.findRowById(rowId);
		if (!currentRow) return;
		const nextRowIndex = this.rows.findIndex((row) => row.id === rowId) + 1;
		const nextRow = this.rows[nextRowIndex];

		if (nextRow?.tabs.length > 0) {
			await goto(`/rows/${nextRow.id}`);
			const firstTabId = nextRow.tabs[0].id;
			this.setCurrentTabId(firstTabId);
			return emit('focus-tab', { id: firstTabId });
		}

		if (currentRow?.tabs.length === 0) {
			const firstRow = this.rows[0];
			await goto(`/rows/${firstRow.id}`);
			const firstTabId = firstRow.tabs[0].id;
			this.setCurrentTabId(firstTabId);
			return emit('focus-tab', { id: firstTabId });
		}

		if (!nextRow) {
			const newRow = this.addRow();
			await goto(`/rows/${newRow.id}`);
			const firstTabId = newRow.tabs[0].id;
			this.setCurrentTabId(firstTabId);
			return emit('focus-tab', { id: firstTabId });
		}

		await goto(`/rows/${nextRow.id}`);
		const firstTabId = nextRow.tabs[0].id;
		this.setCurrentTabId(firstTabId);
		return emit('focus-tab', { id: firstTabId });
	}

	async prevRow({ rowId }: { rowId: string }) {
		const currentRow = this.findRowById(rowId);
		if (!currentRow) return;
		const prevRowIndex = this.rows.findIndex((row) => row.id === rowId) - 1;
		const prevRow = this.rows[prevRowIndex];
		if (!prevRow) return;
		await goto(`/rows/${prevRowIndex}`);
		const firstTabId = this.rows[prevRowIndex].tabs[0].id;
		this.setCurrentTabId(firstTabId);
		return emit('focus-tab', { id: firstTabId });
	}

	async selectRootDir() {
		const dir = await open({
			multiple: false,
			directory: true
		});
		if (!dir) return;
		this.setRootDir(dir);
	}

	async openSettings() {
		const settingsPath = await join(await homeDir(), '.config', 'crest', 'config.toml');
		const settingsTab = this.findTabByPath(settingsPath);
		if (!settingsTab) {
			const currentRowIndex = this.rows.findIndex((row) => row.id === this.currentRowId);
			const lastRow = this.rows[currentRowIndex];
			this.addTab({ rowId: lastRow.id, filePath: settingsPath, external: true });
			return goto(`/rows/${lastRow.id}`);
		}
		this.setCurrentTabId(settingsTab.rowId);
		return goto(`/rows/${settingsTab.rowId}`);
	}

	async processDir(dir: string, fileList: string[] = [], ignoreList: string[] = []) {
		let files = await readDir(dir);
		if (files.some((file) => file.name === '.gitignore')) {
			const gitignoreContent = await readTextFile(await join(dir, '.gitignore'));
			ignoreList.push(gitignoreContent);
		}
		for (const file of files) {
			if (file.isDirectory) {
				const ignore = fastIgnore(ignoreList);
				const shouldIgnore = ignore?.(file.name) ?? false;
				if (shouldIgnore) continue;
				await this.processDir(await join(dir, file.name), fileList, ignoreList);
			} else {
				const relativeDir = (await join(dir, file.name))
					.replace(this.rootDir ?? '', '')
					.substring(1);
				fileList.push(relativeDir);
			}
		}
		return fileList;
	}

	async buildFileList() {
		if (!this.rootDir) return;
		this.fileList = await this.processDir(this.rootDir, [], [BASE_IGNORE_LIST]);
	}
}

export const workspaceStore = new WorkspaceStore();
