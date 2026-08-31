import type { DoculaOptions } from "docula";

// The v5 site is a frozen HTML snapshot in site/public/v5. Docula copies
// public/ to the output root, so /v5 is served as static files and is not
// rebuilt from markdown with the rest of keyv.org.
export const options: Partial<DoculaOptions> = {
	template: "modern",
	githubPath: "jaredwray/keyv",
	autoReadme: false,
	siteTitle: "Keyv",
	siteDescription: "Simple key-value storage with support for multiple backends",
	siteUrl: "https://keyv.org",
	editPageUrl: "https://github.com/jaredwray/keyv/edit/main/website/site/docs",
	headerLinks: [
		{
			label: "v5 Docs",
			url: "/v5/",
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
		},
	],
	sections: [
		{ name: "Storage Adapters", path: "storage-adapters", order: 20 },
		{ name: "Serialization", path: "serialization", order: 21 },
		{ name: "Compression", path: "compression", order: 22 },
		{ name: "Encryption", path: "encryption", order: 23 },
		{ name: "Migration", path: "migration", order: 24 },
	],
};
