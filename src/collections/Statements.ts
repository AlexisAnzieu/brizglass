import type { CollectionConfig } from "payload";

/**
 * Statements Collection
 *
 * Each player submits exactly 3 statements:
 * - 2 false statements (lies)
 * - 1 true statement (truth)
 *
 * During the game, other players try to:
 * 1. Guess who wrote these statements
 * 2. Identify which statement is true
 */
export const Statements: CollectionConfig = {
	slug: "statements",
	admin: {
		useAsTitle: "text",
		defaultColumns: ["text", "player", "isTrue", "game"],
	},
	access: {
		read: () => true,
		create: () => true,
		update: () => true,
		delete: ({ req: { user } }) => Boolean(user),
	},
	fields: [
		{
			name: "text",
			type: "textarea",
			required: true,
			admin: {
				description: "The statement text",
			},
		},
		{
			name: "isTrue",
			type: "checkbox",
			required: true,
			defaultValue: false,
			admin: {
				description: "Is this the true statement?",
			},
		},
		{
			name: "player",
			type: "relationship",
			relationTo: "players",
			required: true,
			index: true,
			admin: {
				description: "The player who wrote this statement",
			},
		},
		{
			name: "game",
			type: "relationship",
			relationTo: "games",
			required: true,
			index: true,
			admin: {
				description: "The game this statement belongs to",
			},
		},
		{
			name: "order",
			type: "number",
			required: true,
			min: 1,
			max: 3,
			admin: {
				description: "Display order (1, 2, or 3)",
			},
		},
	],
	timestamps: true,
};
