<script lang="ts">
	import clsx from 'clsx';
	import type { SvelteComponent } from 'svelte';

	type Action = {
		label?: string;
		active: boolean;
		onClick: () => void;
		icon?: typeof SvelteComponent;
	};

	let { actions }: { actions: Action[] } = $props();
</script>

<div class="flex items-center bg-base-300 rounded">
	{#each actions as action}
		<button
			class={clsx(
				'btn border-none shadow-none bg-base-300 btn-xs',
				!action.label && 'btn-square',
				action.active && 'bg-primary text-primary-content'
			)}
			onclick={action.onClick}
		>
			{#if action.icon}
				<action.icon size={16} />
			{/if}
			{#if action.label}
				<span>{action.label}</span>
			{/if}
		</button>
	{/each}
</div>
