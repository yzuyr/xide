import { SHIKI_LANGUAGES, SHIKI_THEMES } from '$lib/const';
import type { Theme } from '@tauri-apps/api/window';
import { createHighlighter, type Highlighter } from 'shiki';

class AppStore {
	theme = $state<Theme>('light');
	commandMenuOpen = $state(false);
	currentCommandIndex = $state(0);
	configDirty = $state(false);
	highlighter = $state<Highlighter>();

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

	async setupHighlighter() {
		this.highlighter = await createHighlighter({
			langs: SHIKI_LANGUAGES,
			themes: SHIKI_THEMES
		});
	}
}

export const appStore = new AppStore();
