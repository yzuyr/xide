import { defineConfig } from 'vocs';

export default defineConfig({
	title: 'Xide',
	description: 'the next generation of minimalistic IDEs',
	socials: [
		{
			icon: 'github',
			link: 'https://github.com/yzuyr/xide'
		},
		{
			icon: 'x',
			link: 'https://x.com/xidedev'
		}
	],
	sidebar: [
		{
			text: 'Getting Started',
			link: '/docs'
		},
		{
			text: 'Config Reference',
			link: '/config'
		}
	],
	topNav: [
		{
			text: 'Docs',
			link: '/docs'
		}
	]
});
