import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { CompletionCopilot } from 'monacopilot';
import { configStore } from './config.svelte';
import { generateText } from 'ai';
import { workspaceStore } from './workspace.svelte';
import loader from '@monaco-editor/loader';
import { createHighlighter } from 'shiki';
import { SHIKI_LANGUAGES, SHIKI_THEMES } from '$lib/const';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { shikiToMonaco } from '@shikijs/monaco';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ResultAsync } from 'neverthrow';
import { findUp } from '$lib/fs';
import { readTextFile } from '@tauri-apps/plugin-fs';
import JSON5 from 'json5';

class EditorStore {
	copilot = $state<CompletionCopilot>();
	monaco = $state<typeof Monaco>();
	monacoReady = $state(false);

	setupCopilot() {
		this.copilot = new CompletionCopilot(undefined, {
			async model(prompt) {
				const model = createOpenAICompatible({
					name: 'autocomplete',
					baseURL: 'https://openrouter.ai/api/v1',
					headers: {
						Authorization: `Bearer ${configStore.config.ai.autocomplete.api_key}`
					}
				});
				const response = await generateText({
					model: model(configStore.config.ai.autocomplete.model),
					prompt: `Context: ${prompt.context}\nFile: ${prompt.fileContent}\nTask: ${prompt.instruction}`,
					temperature: 0.1,
					maxTokens: 256
				});
				return { text: response.text };
			}
		});
	}

	async loadEditor() {
		this.monacoReady = false;
		if (!workspaceStore.rootDir) return;
		const monacoEditor = await import('monaco-editor');
		const highlighter = await createHighlighter({
			themes: SHIKI_THEMES,
			langs: SHIKI_LANGUAGES
		});
		loader.config({ monaco: monacoEditor.default });
		this.monaco = await loader.init();
		for (const language of SHIKI_LANGUAGES) {
			this.monaco.languages.register({ id: language });
		}
		shikiToMonaco(highlighter, this.monaco);
		this.monaco.editor.registerLinkOpener({
			async open(resource) {
				await openUrl(resource.toString());
				return true;
			}
		});
		this.monaco.editor.registerEditorOpener({
			openCodeEditor(source, resource, selectionOrPosition) {
				console.log('>>>OPEN', source, resource, selectionOrPosition);
				return true;
			}
		});
		const tsconfigPath = await ResultAsync.fromPromise(
			findUp('tsconfig.json', workspaceStore.rootDir),
			(error) => error
		);
		if (tsconfigPath.isErr()) {
			this.monacoReady = true;
			return;
		}
		const tsconfigContent = await readTextFile(tsconfigPath.value ?? '');
		const tsconfig = JSON5.parse(tsconfigContent);
		this.monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
			...tsconfig.compilerOptions,
			moduleResolution:
				tsconfig?.compilerOptions?.moduleResolution === 'bundler'
					? this.monaco.languages.typescript.ModuleResolutionKind.NodeJs
					: tsconfig?.compilerOptions?.moduleResolution
		});
		this.monacoReady = true;
	}
}

export const editorStore = new EditorStore();
