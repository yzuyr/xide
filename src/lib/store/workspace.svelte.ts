import { goto } from '$app/navigation';
import { BASE_IGNORE_LIST } from '$lib/const';
import { emit } from '@tauri-apps/api/event';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import fastIgnore from 'fast-ignore';
import { getConfigPath } from './config.svelte';

export type Tab = {
	id: string;
	rowId: string;
	filePath: string;
	external: boolean;
};

export type Row = {
	id: string;
	tabIds: string[];
};

class WorkspaceStore {
	rootDir = $state<string>();
	currentTabId = $state<string>();
	currentRowId = $state<string>();
	tabs = $state<Map<string, Tab>>(new Map());
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
		return [...this.tabs.values()].find((tab) => tab.filePath === filePath);
	}

	findTabById(id: string) {
		return this.tabs.get(id);
	}

	removeRow(rowId: string) {
		this.rows = this.rows.filter((row) => row.id !== rowId);
	}

	addRow() {
		this.rows.push({ id: crypto.randomUUID(), tabIds: [] });
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
		let rowIndex = this.rows.findIndex((row) => row.id === rowId);

		// If row doesn't exist, create a new one
		if (rowIndex === -1) {
			const newRow = this.addRow();
			rowId = newRow.id;
			rowIndex = this.rows.length - 1;
			this.setCurrentRowId(rowId);
		}

		this.rows[rowIndex].tabIds.push(id);
		this.tabs.set(id, { id, rowId, filePath, external });
		this.currentTabId = id;
		return id;
	}

	removeTab({ tabId }: { tabId: string }) {
		const tab = this.findTabById(tabId);
		if (!tab?.rowId) return;
		const rowIndex = this.rows.findIndex((row) => row.id === tab?.rowId);
		if (rowIndex === -1) return;
		this.rows[rowIndex].tabIds = this.rows[rowIndex].tabIds.filter((id) => id !== tabId);
		this.tabs.delete(tabId);
		if (this.currentTabId === tabId) {
			const remainingTabIds = this.rows[rowIndex].tabIds;
			if (remainingTabIds.length > 0) {
				// Switch to another tab in the same row
				this.setCurrentTabId(remainingTabIds[0]);
			} else {
				// No more tabs in this row, clear currentTabId
				this.setCurrentTabId(undefined);
			}
		}
		if (this.rows[rowIndex].tabIds.length === 0) {
			this.removeRow(tab.rowId);
			// If no rows left, create a new one
			if (this.rows.length === 0) {
				const newRow = this.addRow();
				this.setCurrentRowId(newRow.id);
			}
		}
	}

	nextTab({ tabId }: { tabId: string }) {
		const currentTab = this.findTabById(tabId);
		if (!currentTab?.rowId) return;
		const row = this.findRowById(currentTab.rowId);
		if (!row) return;
		const currentTabIndex = row.tabIds.findIndex((id) => id === tabId);
		const nextTabIndex = currentTabIndex + 1;
		if (row.tabIds.length > nextTabIndex) {
			return emit('focus-tab', { id: row.tabIds[nextTabIndex] });
		}
		const firstTabId = row.tabIds[0];
		return emit('focus-tab', { id: firstTabId });
	}

	prevTab({ tabId }: { tabId: string }) {
		const currentTab = this.findTabById(tabId);
		if (!currentTab?.rowId) return;
		const row = this.findRowById(currentTab.rowId);
		if (!row) return;
		const currentTabIndex = row.tabIds.findIndex((id) => id === tabId);
		const prevTabIndex = currentTabIndex - 1;
		if (prevTabIndex >= 0) {
			return emit('focus-tab', { id: row.tabIds[prevTabIndex] });
		}
		const lastTabId = row.tabIds[row.tabIds.length - 1];
		return emit('focus-tab', { id: lastTabId });
	}

	async nextRow({ rowId }: { rowId: string }) {
		const currentRow = this.findRowById(rowId);
		if (!currentRow) return;
		const nextRowIndex = this.rows.findIndex((row) => row.id === rowId) + 1;
		const nextRow = this.rows[nextRowIndex];

		if (nextRow?.tabIds.length > 0) {
			await goto(`/rows/${nextRow.id}`);
			const firstTabId = nextRow.tabIds[0];
			this.setCurrentTabId(firstTabId);
			return emit('focus-tab', { id: firstTabId });
		}

		if (currentRow?.tabIds.length === 0) {
			const firstRow = this.rows[0];
			await goto(`/rows/${firstRow.id}`);
			const firstTabId = firstRow.tabIds[0];
			this.setCurrentTabId(firstTabId);
			return emit('focus-tab', { id: firstTabId });
		}

		if (!nextRow) {
			const newRow = this.addRow();
			await goto(`/rows/${newRow.id}`);
			const firstTabId = newRow.tabIds[0];
			this.setCurrentTabId(firstTabId);
			return emit('focus-tab', { id: firstTabId });
		}

		await goto(`/rows/${nextRow.id}`);
		const firstTabId = nextRow.tabIds[0];
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
		const firstTabId = this.rows[prevRowIndex].tabIds[0];
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
		const settingsPath = await getConfigPath();
		const settingsTab = this.findTabByPath(settingsPath);
		if (!settingsTab) {
			const currentRowIndex = this.rows.findIndex((row) => row.id === this.currentRowId);
			const lastRow = currentRowIndex >= 0 ? this.rows[currentRowIndex] : this.rows[0];
			const tabId = this.addTab({ rowId: lastRow.id, filePath: settingsPath, external: true });
			this.setCurrentTabId(tabId);
			await emit('focus-tab', { id: tabId });
			return goto(`/rows/${lastRow.id}`);
		}
		this.setCurrentTabId(settingsTab.id);
		await emit('focus-tab', { id: settingsTab.id });
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
				if (BASE_IGNORE_LIST.includes(file.name)) continue;
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
