import { join } from '@tauri-apps/api/path';
import { BaseDirectory, readTextFile, exists, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
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
			api_key: z.string().default("")
		})
	})
});

async function writeDefaultConfig() {
	const defaultContent = Toml.stringify(ConfigSchema.parse({ editor: {}, ai: { agent: {}, autocomplete: {} } }))
	console.log('Writing default config:', defaultContent);
	await mkdir(await getConfigDir(), { baseDir: BaseDirectory.Home });
	return writeTextFile(await getConfigPath(), defaultContent, { baseDir: BaseDirectory.Home })
}

async function getConfigDir() {
	return join('.config', 'crest');
}

async function getConfigPath() {
	return join(await getConfigDir(), 'config.toml');
}

async function readConfig() {
	const configExists = await exists(await getConfigPath(), { baseDir: BaseDirectory.Home })
	if (!configExists) {
		await writeDefaultConfig()
	}
	return readTextFile(await getConfigPath(), { baseDir: BaseDirectory.Home });
}

export async function getConfig() {
	const config = await readConfig();
	const parsedToml = Toml.parse(config);
	return ConfigSchema.parse(parsedToml);
}
