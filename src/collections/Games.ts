import type { CollectionConfig } from "payload";

/**
 * Games Collection
 *
 * Represents a brizglass game session.
 *
 * Game Flow:
 * 1. Admin creates game -> status: 'lobby'
 * 2. Players join via code -> status: 'lobby'
 * 3. Players submit statements -> status: 'lobby'
 * 4. Admin starts game -> status: 'voting-author'
 *
 * AUTHOR PHASE (no reveals between rounds):
 * 5. Players vote on who wrote player 1's statements -> voting-author (round 1)
 * 6. Players vote on who wrote player 2's statements -> voting-author (round 2)
 * ... continue for all N players
 * 7. Show ALL author results at once -> status: 'results-author'
 *
 * TRUTH PHASE (reveal after each round):
 * 8. Players vote on player 1's true statement -> voting-truth (truthRound 1)
 * 9. Reveal player 1's truth -> results-truth
 * 10. Players vote on player 2's true statement -> voting-truth (truthRound 2)
 * 11. Reveal player 2's truth -> results-truth
 * ... continue for all N players
 * 12. After last results-truth -> status: 'finished'
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
					"Current author voting round (0 = not started, 1 to N = which player's statements are being voted on)",
			},
		},
		{
			name: "truthRound",
			type: "number",
			required: true,
			defaultValue: 0,
			admin: {
				description:
					"Current truth voting round (0 = not started, 1 to N = which player's truth is being voted on)",
			},
		},
		{
			name: "currentPlayerId",
			type: "text",
			admin: {
				description:
					"ID of the player whose statements are currently being shown",
			},
		},
		{
			name: "playerOrder",
			type: "json",
			admin: {
				description:
					"Array of player IDs defining the order for rounds (set when game starts)",
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
