import type { CollectionConfig } from "payload";

/**
 * Players Collection
 *
 * Represents a player in an brizglass game.
 * Players join via game code and submit their nickname.
 * Each player submits 3 statements (2 false, 1 true).
 * Players accumulate points by:
 * - Correctly guessing who wrote statements
 * - Correctly identifying the true statement
 * - Fooling others with their false statements
 */
export const Players: CollectionConfig = {
	slug: "players",
	admin: {
		useAsTitle: "nickname",
		defaultColumns: ["nickname", "game", "score", "hasSubmittedStatements"],
	},
	access: {
		read: () => true,
		create: () => true,
		update: () => true,
		delete: ({ req: { user } }) => Boolean(user),
	},
	fields: [
		{
			name: "nickname",
			type: "text",
			required: true,
			admin: {
				description: "Player display name",
			},
		},
		{
			name: "avatar",
			type: "upload",
			relationTo: "media",
			admin: {
				description: "Player profile picture",
			},
		},
		{
			name: "game",
			type: "relationship",
			relationTo: "games",
			required: true,
			index: true,
			admin: {
				description: "The game this player belongs to",
			},
		},
		{
			name: "sessionToken",
			type: "text",
			required: true,
			admin: {
				description: "Session token to identify the player (stored in cookie)",
				readOnly: true,
			},
		},
		{
			name: "score",
			type: "number",
			required: true,
			defaultValue: 0,
			admin: {
				description: "Total points accumulated",
			},
		},
		{
			name: "hasSubmittedStatements",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Whether player has submitted their 3 statements",
			},
		},
	],
	timestamps: true,
};
