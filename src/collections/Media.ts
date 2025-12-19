import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
	slug: "media",
	access: {
		read: () => true,
		create: () => true,
	},
	fields: [
		{
			name: "alt",
			type: "text",
			required: true,
		},
	],
	upload: {
		mimeTypes: ["image/*"],
		imageSizes: [
			{
				name: "thumbnail",
				width: 150,
				height: 150,
				fit: "cover",
			},
			{
				name: "avatar",
				width: 300,
				height: 300,
				fit: "cover",
			},
		],
	},
};
