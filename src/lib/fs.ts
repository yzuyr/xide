import type { IDisposable } from '@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle';
import type { URI } from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';
import type { IFileSystemProviderWithFileReadWriteCapability } from '@codingame/monaco-vscode-files-service-override';
import type {
	FileChangeType,
	FileSystemProviderCapabilities,
	FileType,
	IFileDeleteOptions,
	IFileOverwriteOptions,
	IFileWriteOptions,
	IStat,
	IWatchOptions
} from '@codingame/monaco-vscode-files-service-override';
import type { Event } from 'vscode';
import { Emitter } from '@codingame/monaco-vscode-api/vscode/vs/base/common/event';
import {
	readFile as tauriReadFile,
	writeFile as tauriWriteFile,
	readDir as tauriReadDir,
	stat as tauriStat,
	mkdir as tauriMkdir,
	remove as tauriRemove,
	rename as tauriRename,
	exists as tauriExists,
	watch as tauriWatch
} from '@tauri-apps/plugin-fs';
import { homeDir, join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';

export class TauriFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {
	private _onDidChangeCapabilities = new Emitter<void>();
	private _onDidChangeFile = new Emitter<{ type: FileChangeType; resource: URI }[]>();
	private _baseDir: string | null = null;
	private _watchers = new Map<string, () => Promise<void>>();

	get capabilities(): FileSystemProviderCapabilities {
		return 2 | 4 | 8 | 16 | 32; // File, Folder, Read, Write, Create
	}

	onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;
	onDidChangeFile: Event<{ type: FileChangeType; resource: URI }[]> = this._onDidChangeFile.event;

	readFile = async (resource: URI): Promise<Uint8Array> => {
		const path = await this.getFullPath(resource);
		const content = await tauriReadFile(path);
		return new Uint8Array(content);
	};

	writeFile = async (
		resource: URI,
		content: Uint8Array,
		opts: IFileWriteOptions
	): Promise<void> => {
		const path = await this.getFullPath(resource);
		await tauriWriteFile(path, content, { createNew: opts.create && !opts.overwrite });
		this._onDidChangeFile.fire([{ type: 2 as FileChangeType, resource }]); // FileChangeType.UPDATED
	};

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		const watchKey = resource.toString();

		// If already watching this resource, return existing disposable
		if (this._watchers.has(watchKey)) {
			return {
				dispose: async () => {
					const stopWatching = this._watchers.get(watchKey);
					if (stopWatching) {
						await stopWatching();
						this._watchers.delete(watchKey);
					}
				}
			};
		}

		// Start watching the resource
		const startWatching = async () => {
			try {
				const path = await this.getFullPath(resource);
				const stopWatching = await tauriWatch(
					path,
					(event) => {
						const eventType = this.mapTauriEventToFileChangeType(event.type);
						if (eventType !== undefined) {
							// Process all paths in the event
							const changes = event.paths.map(async (eventPath) => {
								const relativePath = await this.getRelativePath(eventPath);
								const changedResource = resource.with({ path: `/${relativePath}` });
								return { type: eventType, resource: changedResource };
							});

							Promise.all(changes).then((resolvedChanges) => {
								this._onDidChangeFile.fire(resolvedChanges);
							});
						}
					},
					{ recursive: opts.recursive }
				);

				this._watchers.set(watchKey, async () => {
					stopWatching();
				});
				return async () => {
					stopWatching();
				};
			} catch (error) {
				console.error(`Failed to watch ${resource.toString()}:`, error);
				return async () => {};
			}
		};

		// Start watching asynchronously
		startWatching();

		return {
			dispose: async () => {
				const stopWatching = this._watchers.get(watchKey);
				if (stopWatching) {
					await stopWatching();
					this._watchers.delete(watchKey);
				}
			}
		};
	}

	async stat(resource: URI): Promise<IStat> {
		const path = await this.getFullPath(resource);
		const stats = await tauriStat(path);

		return {
			type: stats.isDirectory ? 2 : 1, // FileType.Directory : FileType.File
			size: stats.size,
			mtime: stats.mtime ? new Date(stats.mtime).getTime() : 0,
			ctime: stats.mtime ? new Date(stats.mtime).getTime() : 0, // Use mtime for ctime since ctime doesn't exist
			permissions: stats.readonly ? 1 : undefined // FilePermission.Readonly
		};
	}

	async mkdir(resource: URI): Promise<void> {
		const path = await this.getFullPath(resource);
		await tauriMkdir(path, { recursive: true });
		this._onDidChangeFile.fire([{ type: 1 as FileChangeType, resource }]); // FileChangeType.ADDED
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const path = await this.getFullPath(resource);
		const entries = await tauriReadDir(path);

		return entries.map((entry) => [
			entry.name,
			entry.isDirectory ? 2 : 1 // FileType.Directory : FileType.File
		]);
	}

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		const path = await this.getFullPath(resource);
		await tauriRemove(path, { recursive: opts.recursive });
		this._onDidChangeFile.fire([{ type: 3 as FileChangeType, resource }]); // FileChangeType.DELETED
	}

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		const fromPath = await this.getFullPath(from);
		const toPath = await this.getFullPath(to);

		if (!opts.overwrite && (await tauriExists(toPath))) {
			throw new Error(`File already exists: ${toPath}`);
		}

		await tauriRename(fromPath, toPath);
		this._onDidChangeFile.fire([
			{ type: 3 as FileChangeType, resource: from }, // FileChangeType.DELETED
			{ type: 1 as FileChangeType, resource: to } // FileChangeType.ADDED
		]);
	}

	private async getBaseDir(): Promise<string> {
		if (!this._baseDir) {
			this._baseDir = await homeDir();
		}
		return this._baseDir;
	}

	private async getFullPath(resource: URI): Promise<string> {
		const baseDir = await this.getBaseDir();
		const relativePath = resource.path.startsWith('/') ? resource.path.slice(1) : resource.path;
		return `${baseDir}/${relativePath}`;
	}

	private async getRelativePath(fullPath: string): Promise<string> {
		const baseDir = await this.getBaseDir();
		return fullPath.startsWith(baseDir) ? fullPath.slice(baseDir.length + 1) : fullPath;
	}

	private mapTauriEventToFileChangeType(eventType: any): FileChangeType | undefined {
		// Handle string event types
		if (typeof eventType === 'string') {
			switch (eventType) {
				case 'create':
					return 1 as FileChangeType; // FileChangeType.ADDED
				case 'modify':
					return 2 as FileChangeType; // FileChangeType.UPDATED
				case 'remove':
					return 3 as FileChangeType; // FileChangeType.DELETED
				default:
					return undefined;
			}
		}

		// Handle object event types
		if (typeof eventType === 'object' && eventType !== null) {
			if ('create' in eventType) {
				return 1 as FileChangeType; // FileChangeType.ADDED
			} else if ('modify' in eventType) {
				return 2 as FileChangeType; // FileChangeType.UPDATED
			} else if ('remove' in eventType) {
				return 3 as FileChangeType; // FileChangeType.DELETED
			}
		}

		return undefined;
	}
}

export async function findUp(fileName: string, baseDir: string) {
	const filePath = await join(baseDir, fileName);
	if (await exists(filePath)) {
		return filePath;
	}
	const parentDir = baseDir.split('/').slice(0, -1).join('/');
	if (!parentDir) {
		return undefined;
	}
	return findUp(fileName, parentDir);
}
