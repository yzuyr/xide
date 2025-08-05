import { SHIKI_THEMES } from '$lib/const';
import { homeDir, join } from '@tauri-apps/api/path';
import { readTextFile, exists, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import dedent from 'dedent';
import { merge } from 'merge-anything';
import Toml from 'smol-toml';
import { z } from 'zod';

const CONFIG_INFO = dedent`
# ██   ██ ██ ██████  ███████
#  ██ ██  ██ ██   ██ ██
#   ███   ██ ██   ██ █████
#  ██ ██  ██ ██   ██ ██
# ██   ██ ██ ██████  ███████
#
# Reference: https://xide.dev/config
`;

const ConfigSchema = z.object({
	editor: z.object({
		font_size: z.number().default(14),
		theme_mode: z.enum(['system', 'light', 'dark']).default('system'),
		light_theme: z.enum(SHIKI_THEMES).default('min-light'),
		dark_theme: z.enum(SHIKI_THEMES).default('houston')
	}),
	ai: z.object({
		agent: z.object({
			enabled: z.boolean().default(true),
			model: z.string().default('github-copilot/gpt-4.1')
		}),
		autocomplete: z.object({
			enabled: z.boolean().default(true),
			base_url: z.url().default('https://openrouter.ai/api/v1'),
			model: z.string().default('mistralai/codestral-2501'),
			api_key: z.string().default('')
		})
	})
});

type Config = z.infer<typeof ConfigSchema>;

const BLANK_CONFIG = ConfigSchema.parse({ editor: {}, ai: { agent: {}, autocomplete: {} } });

async function writeConfig(config: Config) {
	const configPath = await getConfigPath();
	const newConfig = ConfigSchema.parse(config);
	const fileContent = `${CONFIG_INFO}\n\n${Toml.stringify(newConfig)}`;
	await writeTextFile(configPath, fileContent);
}

async function writeDefaultConfig() {
	await mkdir(await getConfigDir());
	await writeConfig(BLANK_CONFIG);
}

async function getConfigDir() {
	return join(await homeDir(), '.config', 'xide');
}

export async function getConfigPath() {
	return join(await getConfigDir(), 'config.toml');
}

async function readConfig() {
	const configPath = await getConfigPath();
	const configExists = await exists(configPath);
	if (!configExists) {
		await writeDefaultConfig();
	}
	return readTextFile(await getConfigPath());
}

export async function getConfig() {
	const config = await readConfig();
	const parsedToml = Toml.parse(config);
	const mergedConfig = merge(BLANK_CONFIG, parsedToml);
	return ConfigSchema.parse(mergedConfig);
}

class ConfigStore {
	config = $state<Config>(BLANK_CONFIG);

	async init() {
		await this.restore();
		await this.persist();
	}

	async restore() {
		this.config = await getConfig();
	}

	async persist() {
		if (!this.config) return;
		await writeConfig(this.config);
		await this.restore();
	}
}

export const configStore = new ConfigStore();
