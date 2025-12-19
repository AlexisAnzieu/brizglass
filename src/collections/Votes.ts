import type { CollectionConfig } from "payload";

/**
 * Votes Collection
 *
 * Records all votes cast during the game.
 * Two types of votes:
 * 1. 'author' - Guessing who wrote the statements
 * 2. 'truth' - Guessing which statement is true
 *
 * Points are awarded:
 * - Correct author guess: +1 point to voter
 * - Correct truth guess: +1 point to voter
 * - Fooling someone with false statement: +1 point to statement author
 */
export const Votes: CollectionConfig = {
	slug: "votes",
	admin: {
		defaultColumns: ["voter", "voteType", "round", "game"],
	},
	access: {
		read: () => true,
		create: () => true,
		update: () => true,
		delete: ({ req: { user } }) => Boolean(user),
	},
	fields: [
		{
			name: "game",
			type: "relationship",
			relationTo: "games",
			required: true,
			index: true,
			admin: {
				description: "The game this vote belongs to",
			},
		},
		{
			name: "round",
			type: "number",
			required: true,
			admin: {
				description: "The round number when this vote was cast",
			},
		},
		{
			name: "voter",
			type: "relationship",
			relationTo: "players",
			required: true,
			index: true,
			admin: {
				description: "The player who cast this vote",
			},
		},
		{
			name: "voteType",
			type: "select",
			required: true,
			options: [
				{ label: "Author Vote", value: "author" },
				{ label: "Truth Vote", value: "truth" },
			],
			admin: {
				description: "Type of vote",
			},
		},
		{
			name: "votedPlayer",
			type: "relationship",
			relationTo: "players",
			admin: {
				description: "The player voted as the author (for author votes)",
				condition: (data) => data.voteType === "author",
			},
		},
		{
			name: "votedStatement",
			type: "relationship",
			relationTo: "statements",
			admin: {
				description: "The statement voted as true (for truth votes)",
				condition: (data) => data.voteType === "truth",
			},
		},
		{
			name: "isCorrect",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description: "Whether this vote was correct",
			},
		},
	],
	timestamps: true,
};
