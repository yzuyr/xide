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
	dirList = $state<string[]>([]);
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
		// If only one row, navigate to overview
		if (this.rows.length === 1) {
			return goto('/');
		}

		const currentRowIndex = this.rows.findIndex((row) => row.id === rowId);
		if (currentRowIndex === -1) return;

		const nextRowIndex = currentRowIndex + 1;
		const targetRow = nextRowIndex < this.rows.length ? this.rows[nextRowIndex] : this.rows[0];

		this.setCurrentRowId(targetRow.id);

		// If target row has tabs, set the current tab before navigation
		if (targetRow.tabIds.length > 0) {
			const firstTabId = targetRow.tabIds[0];
			this.setCurrentTabId(firstTabId);
		}

		await goto(`/rows/${targetRow.id}`);

		// Focus the tab after navigation
		if (targetRow.tabIds.length > 0) {
			const firstTabId = targetRow.tabIds[0];
			return emit('focus-tab', { id: firstTabId });
		}
	}

	async prevRow({ rowId }: { rowId: string }) {
		// If only one row, navigate to overview
		if (this.rows.length === 1) {
			return goto('/');
		}

		const currentRowIndex = this.rows.findIndex((row) => row.id === rowId);
		if (currentRowIndex === -1) return;

		const prevRowIndex = currentRowIndex - 1;
		const targetRow = prevRowIndex >= 0 ? this.rows[prevRowIndex] : this.rows[this.rows.length - 1];

		if (!targetRow) return;

		this.setCurrentRowId(targetRow.id);

		// If target row has tabs, set the current tab before navigation
		if (targetRow.tabIds.length > 0) {
			const firstTabId = targetRow.tabIds[0];
			this.setCurrentTabId(firstTabId);
		}

		await goto(`/rows/${targetRow.id}`);

		// Focus the tab after navigation
		if (targetRow.tabIds.length > 0) {
			const firstTabId = targetRow.tabIds[0];
			return emit('focus-tab', { id: firstTabId });
		}
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

	async processDir({
		dir,
		fileList = [],
		dirList = [],
		ignoreList = []
	}: {
		dir: string;
		fileList?: string[];
		dirList?: string[];
		ignoreList?: string[];
	}) {
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
				const currentDir = await join(dir, file.name);
				const relativeDir = currentDir.replace(this.rootDir ?? '', '').substring(1);
				dirList.push(relativeDir);
				await this.processDir({
					dir: await join(dir, file.name),
					fileList,
					dirList,
					ignoreList
				});
			} else {
				const relativeDir = (await join(dir, file.name))
					.replace(this.rootDir ?? '', '')
					.substring(1);
				if (BASE_IGNORE_LIST.includes(file.name)) continue;
				fileList.push(relativeDir);
			}
		}
		return { fileList, dirList };
	}

	async buildFileList() {
		if (!this.rootDir) return;
		const { fileList, dirList } = await this.processDir({
			dir: this.rootDir,
			ignoreList: [BASE_IGNORE_LIST],
			fileList: [],
			dirList: []
		});
		this.fileList = fileList;
		this.dirList = dirList;
	}
}

export const workspaceStore = new WorkspaceStore();
