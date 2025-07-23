import { join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';

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
