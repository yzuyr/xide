import { SHIKI_LANGUAGES, SHIKI_THEMES } from '$lib/const';
import type { Theme } from '@tauri-apps/api/window';
import { createHighlighter, type Highlighter } from 'shiki';
import { SvelteSet } from 'svelte/reactivity';
import { load } from '@tauri-apps/plugin-store';

class AppStore {
	theme = $state<Theme>('light');
	commandMenuOpen = $state(false);
	currentCommandIndex = $state(0);
	configDirty = $state(false);
	highlighter = $state<Highlighter>();
	lastProjectPaths = $state<SvelteSet<string>>(new SvelteSet());

	async restore() {
		const store = await load('app.json');
		this.lastProjectPaths = new SvelteSet((await store.get('lastProjectPaths')) ?? []);
	}

	async persist() {
		const store = await load('app.json');
		await store.set('lastProjectPaths', Array.from(this.lastProjectPaths));
	}

	setCommandMenuOpen(open: boolean) {
		this.commandMenuOpen = open;
	}

	toggleCommandMenu() {
		return this.setCommandMenuOpen(!this.commandMenuOpen);
	}

	setCurrentCommandIndex(index: number) {
		this.currentCommandIndex = index;
	}

	setConfigDirty(dirty: boolean) {
		this.configDirty = dirty;
	}

	async addLastProjectPath(path: string) {
		this.lastProjectPaths.add(path);
	}

	async setupHighlighter() {
		this.highlighter = await createHighlighter({
			langs: SHIKI_LANGUAGES,
			themes: SHIKI_THEMES
		});
	}
}

export const appStore = new AppStore();
