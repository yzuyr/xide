import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { CompletionCopilot } from 'monacopilot';
import { configStore } from './config.svelte';
import { generateText } from 'ai';
import { workspaceStore } from './workspace.svelte';
import * as monaco from 'monaco-editor';
import { createHighlighter } from 'shiki';
import { SHIKI_LANGUAGES, SHIKI_THEMES } from '$lib/const';
import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
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
				const aiModel = createOpenAICompatible({
					name: 'autocomplete',
					baseURL: 'https://openrouter.ai/api/v1',
					headers: {
						Authorization: `Bearer ${configStore.config.ai.autocomplete.api_key}`
					}
				});
				const response = await generateText({
					model: aiModel(configStore.config.ai.autocomplete.model),
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
		const highlighter = await createHighlighter({
			themes: SHIKI_THEMES,
			langs: SHIKI_LANGUAGES
		});
		for (const language of SHIKI_LANGUAGES) {
			monaco.languages.register({ id: language });
		}
		shikiToMonaco(highlighter, monaco);
		monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
		monaco.editor.registerLinkOpener({
			async open(resource) {
				await openUrl(resource.toString());
				return true;
			}
		});
		monaco.editor.registerEditorOpener({
			openCodeEditor(source, resource, selectionOrPosition) {
				console.log('>>>OPEN', source, resource, selectionOrPosition);
				return true;
			}
		});

		// Handle TypeScript configuration with proper error handling
		try {
			const tsconfigPath = await ResultAsync.fromPromise(
				findUp('tsconfig.json', workspaceStore.rootDir),
				(error) => error
			);

			if (tsconfigPath.isOk() && tsconfigPath.value) {
				const tsconfigContent = await readTextFile(tsconfigPath.value);
				const tsconfig = JSON5.parse(tsconfigContent);

				if (tsconfig?.compilerOptions) {
					monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
						...tsconfig.compilerOptions,
						moduleResolution:
							tsconfig?.compilerOptions?.moduleResolution === 'bundler'
								? monaco.languages.typescript.ModuleResolutionKind.NodeJs
								: tsconfig?.compilerOptions?.moduleResolution
					});
				}
			}
		} catch (error) {
			// Silently handle TypeScript config errors to prevent editor crashes
			console.warn('Failed to load TypeScript configuration:', error);
		}

		this.monaco = monaco;
		this.monacoReady = true;
	}
}

export const editorStore = new EditorStore();
