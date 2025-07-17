import { join } from '@tauri-apps/api/path';
import { BaseDirectory, readTextFile } from '@tauri-apps/plugin-fs';
import Toml from 'smol-toml';
import { z } from 'zod';

const ConfigSchema = z.object({
	editor: z.object({
		font_size: z.number().default(14)
	}),
	ai: z.object({
		agent: z.object({
			model: z.string().default('github-copilot/gpt-4.1')
		}),
		autocomplete: z.object({
			api_key: z.string().optional()
		})
	})
});

async function getConfigDir() {
	return join('.config', 'crest', 'config.toml');
}

async function readConfig() {
	const configContent = await readTextFile(await getConfigDir(), { baseDir: BaseDirectory.Home });
	return Toml.parse(configContent);
}

export async function getConfig() {
	const config = await readConfig();
	return ConfigSchema.parse(config);
}
