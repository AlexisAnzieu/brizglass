import type { CollectionConfig } from "payload";

/**
 * Games Collection
 *
 * Represents an brizglass game session.
 * Game Flow:
 * 1. Admin creates game -> status: 'lobby'
 * 2. Players join via code -> status: 'lobby'
 * 3. Players submit statements -> status: 'lobby'
 * 4. Admin starts game -> status: 'voting-author'
 * 5. Players vote on statement author -> status: 'voting-author'
 * 6. Results shown -> status: 'results-author'
 * 7. Players vote on true statement -> status: 'voting-truth'
 * 8. Results shown -> status: 'results-truth'
 * 9. Next round or -> status: 'finished'
 */
export const Games: CollectionConfig = {
	slug: "games",
	admin: {
		useAsTitle: "code",
		defaultColumns: ["code", "status", "createdAt"],
	},
	access: {
		read: () => true,
		create: () => true,
		update: () => true,
		delete: ({ req: { user } }) => Boolean(user),
	},
	fields: [
		{
			name: "code",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				description: "Unique game code for players to join (e.g., ABC123)",
			},
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "lobby",
			options: [
				{ label: "Lobby (Waiting for players)", value: "lobby" },
				{ label: "Voting Author", value: "voting-author" },
				{ label: "Results Author", value: "results-author" },
				{ label: "Voting Truth", value: "voting-truth" },
				{ label: "Results Truth", value: "results-truth" },
				{ label: "Finished", value: "finished" },
			],
			admin: {
				description: "Current game phase",
			},
		},
		{
			name: "currentRound",
			type: "number",
			required: true,
			defaultValue: 0,
			admin: {
				description:
					"Current round number (0 = not started, 1+ = active round)",
			},
		},
		{
			name: "currentPlayerId",
			type: "text",
			admin: {
				description:
					"ID of the player whose statements are being guessed this round",
			},
		},
		{
			name: "adminToken",
			type: "text",
			required: true,
			admin: {
				description: "Secret token for admin to control the game",
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
