import type { Theme } from '@tauri-apps/api/window';

class AppStore {
	theme = $state<Theme>('light');
	commandMenuOpen = $state(false);
	currentCommandIndex = $state(0);

	setCommandMenuOpen(open: boolean) {
		this.commandMenuOpen = open;
	}

	toggleCommandMenu() {
		return this.setCommandMenuOpen(!this.commandMenuOpen);
	}

	setCurrentCommandIndex(index: number) {
		this.currentCommandIndex = index;
	}
}

export const appStore = new AppStore();
