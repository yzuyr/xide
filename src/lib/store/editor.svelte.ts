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
import { ResultAsync, ok, err } from 'neverthrow';
import { match, P } from 'ts-pattern';
import { findUp } from '$lib/fs';
import { readTextFile, readDir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import JSON5 from 'json5';
import { convertCompilerOptionsFromJson } from 'typescript';
import { goto } from '$app/navigation';
import z from 'zod';

export const RangeSchema = z.object({
	startLineNumber: z.number(),
	startColumn: z.number(),
	endLineNumber: z.number(),
	endColumn: z.number()
});

export type Range = z.infer<typeof RangeSchema>;

interface TypeDefinition {
	content: string;
	uri: string;
}

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

	private scanTypeDefinitions(nodeModulesPath: string): ResultAsync<TypeDefinition[], Error> {
		return ResultAsync.fromPromise(
			this._scanTypeDefinitionsImpl(nodeModulesPath),
			(error) => new Error(`Failed to scan type definitions: ${error}`)
		);
	}

	private async _scanTypeDefinitionsImpl(nodeModulesPath: string): Promise<TypeDefinition[]> {
		const typeDefinitions: TypeDefinition[] = [];
		const entries = await readDir(nodeModulesPath);

		for (const entry of entries) {
			if (!entry.isDirectory) continue;

			const packagePath = await join(nodeModulesPath, entry.name);

			await match(entry.name)
				.with('@types', () => this._scanTypesDirectory(packagePath, typeDefinitions))
				.with(P.string.startsWith('@'), (name) =>
					this._scanScopedPackages(packagePath, typeDefinitions, name)
				)
				.otherwise((name) => this._scanPackageForTypes(packagePath, typeDefinitions, name));
		}

		return typeDefinitions;
	}

	private async _scanTypesDirectory(typesPath: string, typeDefinitions: TypeDefinition[]) {
		const entries = await readDir(typesPath);
		for (const entry of entries) {
			if (entry.isDirectory) {
				const packagePath = await join(typesPath, entry.name);
				await this._scanPackageForTypes(packagePath, typeDefinitions, `@types/${entry.name}`);
			}
		}
	}

	private async _scanScopedPackages(
		scopePath: string,
		typeDefinitions: TypeDefinition[],
		scopeName: string
	) {
		const entries = await readDir(scopePath);
		for (const entry of entries) {
			if (entry.isDirectory) {
				const packagePath = await join(scopePath, entry.name);
				await this._scanPackageForTypes(packagePath, typeDefinitions, `${scopeName}/${entry.name}`);
			}
		}
	}

	private async _scanPackageForTypes(
		packagePath: string,
		typeDefinitions: TypeDefinition[],
		packageName: string
	) {
		await this._scanDirectoryForDTs(packagePath, typeDefinitions, packageName, '');
	}

	private async _scanDirectoryForDTs(
		dirPath: string,
		typeDefinitions: TypeDefinition[],
		packageName: string,
		relativePath: string
	) {
		const entries = await readDir(dirPath);

		for (const entry of entries) {
			const entryPath = await join(dirPath, entry.name);
			const currentRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

			await match(entry)
				.with({ isDirectory: true, name: P.string.regex(/^(?!\.|node_modules).*/) }, async () => {
					await this._scanDirectoryForDTs(
						entryPath,
						typeDefinitions,
						packageName,
						currentRelativePath
					);
				})
				.with({ isFile: true, name: P.string.endsWith('.d.ts') }, async () => {
					const content = await readTextFile(entryPath);
					const uri = `file:///node_modules/${packageName}/${currentRelativePath}`;
					typeDefinitions.push({ content, uri });
				})
				.otherwise(() => {});
		}
	}

	private loadTypeDefinitions(): ResultAsync<void, Error> {
		if (!workspaceStore.rootDir || !this.monaco) {
			return ResultAsync.fromSafePromise(Promise.resolve());
		}

		return ResultAsync.fromPromise(
			join(workspaceStore.rootDir, 'node_modules'),
			(error) => new Error(`Failed to resolve node_modules path: ${error}`)
		)
			.andThen((nodeModulesPath) => this.scanTypeDefinitions(nodeModulesPath))
			.andThen((typeDefinitions) => {
				console.log(`Loading ${typeDefinitions.length} type definitions...`);

				for (const typeDef of typeDefinitions) {
					try {
						monaco.languages.typescript.typescriptDefaults.addExtraLib(
							typeDef.content,
							typeDef.uri
						);
					} catch (error) {
						console.warn(`Failed to load type definition ${typeDef.uri}:`, error);
					}
				}

				console.log('Type definitions loaded successfully');
				return ok(undefined);
			})
			.mapErr((error) => new Error(`Failed to load type definitions: ${error.message}`));
	}

	private loadWorkspaceFiles(): ResultAsync<void, Error> {
		if (!workspaceStore.rootDir || !this.monaco) {
			return ResultAsync.fromSafePromise(Promise.resolve());
		}

		console.log('Loading workspace files...');
		return this.scanWorkspaceDirectory(workspaceStore.rootDir, '')
			.map(() => {
				console.log('Workspace files loaded successfully');
			})
			.mapErr((error) => new Error(`Failed to load workspace files: ${error.message}`));
	}

	private scanWorkspaceDirectory(dirPath: string, relativePath: string): ResultAsync<void, Error> {
		return ResultAsync.fromPromise(
			this._scanWorkspaceDirectoryImpl(dirPath, relativePath),
			(error) => new Error(`Failed to scan workspace directory ${dirPath}: ${error}`)
		);
	}

	private async _scanWorkspaceDirectoryImpl(dirPath: string, relativePath: string): Promise<void> {
		const entries = await readDir(dirPath);

		for (const entry of entries) {
			const entryPath = await join(dirPath, entry.name);
			const currentRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

			await match(entry)
				.with({ isDirectory: true, name: P.string.regex(/^(?!\.|node_modules).*/) }, async () => {
					await this._scanWorkspaceDirectoryImpl(entryPath, currentRelativePath);
				})
				.with(
					{
						isFile: true,
						name: P.union(
							P.string.endsWith('.ts'),
							P.string.endsWith('.js'),
							P.string.endsWith('.svelte')
						)
					},
					async ({ name }) => {
						const content = await readTextFile(entryPath);
						const uri = monaco.Uri.file(currentRelativePath);
						const existingModel = monaco.editor.getModel(uri);

						if (!existingModel) {
							const language = match(name)
								.with(P.string.endsWith('.svelte'), () => 'typescript')
								.with(P.string.endsWith('.ts'), () => 'typescript')
								.with(P.string.endsWith('.js'), () => 'javascript')
								.exhaustive();
							monaco.editor.createModel(content, language, uri);
						}
					}
				)
				.otherwise(() => {});
		}
	}

	private loadTypeScriptConfig(): ResultAsync<void, Error> {
		if (!workspaceStore.rootDir) {
			return ResultAsync.fromSafePromise(Promise.resolve());
		}

		return ResultAsync.fromPromise(
			findUp('tsconfig.json', workspaceStore.rootDir),
			(error) => new Error(`Failed to find tsconfig.json: ${error}`)
		).andThen((tsconfigPath) => {
			if (!tsconfigPath) {
				return ok(undefined);
			}

			return ResultAsync.fromPromise(
				readTextFile(tsconfigPath),
				(error) => new Error(`Failed to read tsconfig.json: ${error}`)
			).andThen((tsconfigContent) => {
				try {
					const tsconfig = JSON5.parse(tsconfigContent);
					if (tsconfig?.compilerOptions && workspaceStore.rootDir) {
						const parsed = convertCompilerOptionsFromJson(
							tsconfig.compilerOptions,
							workspaceStore.rootDir
						);
						monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
							parsed.options as any
						);
					}
					return ok(undefined);
				} catch (parseError) {
					return err(new Error(`Failed to parse tsconfig.json: ${parseError}`));
				}
			});
		});
	}

	async loadEditor() {
		this.monacoReady = false;

		const highlighterResult = await ResultAsync.fromPromise(
			createHighlighter({
				themes: SHIKI_THEMES,
				langs: SHIKI_LANGUAGES
			}),
			(error) => new Error(`Failed to create highlighter: ${error}`)
		);

		if (highlighterResult.isErr()) {
			console.error('Failed to create highlighter:', highlighterResult.error);
			return;
		}

		const highlighter = highlighterResult.value;

		// Setup Monaco languages and theme
		for (const language of SHIKI_LANGUAGES) {
			monaco.languages.register({ id: language });
		}
		shikiToMonaco(highlighter, monaco);
		monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

		// Register URL opener
		monaco.editor.registerLinkOpener({
			async open(resource) {
				await openUrl(resource.toString());
				return true;
			}
		});

		// Register editor opener
		monaco.editor.registerEditorOpener({
			async openCodeEditor(_source, resource, selectionOrPosition) {
				if (!workspaceStore.currentRowId) return false;
				const position = match(selectionOrPosition)
					.with(P.instanceOf(monaco.Position), (position) => ({
						lineNumber: position.lineNumber,
						column: position.column
					}))
					.with(P.instanceOf(monaco.Range), (range) => ({
						lineNumber: range.startLineNumber,
						column: range.startColumn
					}))
					.otherwise(() => ({ lineNumber: 1, column: 1 }));
				const tabId = workspaceStore.addTab({
					rowId: workspaceStore.currentRowId,
					filePath: resource.path.substring(1),
					initialPosition: position
				});
				workspaceStore.setCurrentTabId(tabId);
				await goto(`/rows/${workspaceStore.currentRowId}`);
				return true;
			}
		});

		this.monaco = monaco;

		// Load TypeScript config, type definitions, and workspace files
		const loadResult = await ResultAsync.combine([
			this.loadTypeScriptConfig(),
			this.loadTypeDefinitions(),
			this.loadWorkspaceFiles()
		]);

		if (loadResult.isErr()) {
			console.warn('Some initialization steps failed:', loadResult.error);
		}

		this.monacoReady = true;
	}

	search(query: string) {
		const models = monaco.editor.getModels();
		return models.flatMap((model) => {
			const results = [];
			const matches = model.findMatches(query, false, false, false, null, true);
			for (const match of matches) {
				const path = model.uri.toString().substring(8);
				if (path === 'lib.dom.d.ts') continue;
				if (path.startsWith('node_modules/')) continue;
				results.push({
					path,
					range: match.range
				});
			}
			return results;
		});
	}
}

export const editorStore = new EditorStore();
