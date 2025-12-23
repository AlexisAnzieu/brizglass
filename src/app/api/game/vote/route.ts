import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Game } from "@/payload-types";

type GameStatus = NonNullable<Game["status"]>;

/**
 * POST /api/game/vote
 * Submit a vote (author or truth)
 * Body: {
 *   voteType: 'author' | 'truth',
 *   votedPlayerId?: string,  // For author votes
 *   votedStatementId?: string // For truth votes
 * }
 */
export async function POST(request: NextRequest) {
	try {
		const sessionToken = request.cookies.get("playerSession")?.value;

		if (!sessionToken) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		const body = await request.json();
		const { voteType, votedPlayerId, votedStatementId } = body;

		if (!voteType || !["author", "truth"].includes(voteType)) {
			return NextResponse.json({ error: "Invalid vote type" }, { status: 400 });
		}

		if (voteType === "author" && !votedPlayerId) {
			return NextResponse.json(
				{ error: "Player ID required for author vote" },
				{ status: 400 },
			);
		}

		if (voteType === "truth" && !votedStatementId) {
			return NextResponse.json(
				{ error: "Statement ID required for truth vote" },
				{ status: 400 },
			);
		}

		const payload = await getPayload({ config });

		// Find the voter by session token
		const players = await payload.find({
			collection: "players",
			where: { sessionToken: { equals: sessionToken } },
			limit: 1,
			depth: 1,
		});

		if (players.docs.length === 0) {
			return NextResponse.json({ error: "Player not found" }, { status: 404 });
		}

		const voter = players.docs[0];
		const gameId = typeof voter.game === "object" ? voter.game.id : voter.game;

		// Get game state
		const game = await payload.findByID({
			collection: "games",
			id: gameId,
		});

		// Validate game state for vote type
		if (voteType === "author" && game.status !== "voting-author") {
			return NextResponse.json(
				{ error: "Not in author voting phase" },
				{ status: 400 },
			);
		}

		if (voteType === "truth" && game.status !== "voting-truth") {
			return NextResponse.json(
				{ error: "Not in truth voting phase" },
				{ status: 400 },
			);
		}

		// Prevent voting for own statements
		if (voter.id === game.currentPlayerId) {
			return NextResponse.json(
				{ error: "Cannot vote on your own statements" },
				{ status: 400 },
			);
		}

		// Check if already voted this round
		// For author votes, use currentRound; for truth votes, use truthRound
		const roundToCheck = voteType === "author" ? game.currentRound : game.truthRound;
		const existingVotes = await payload.find({
			collection: "votes",
			where: {
				and: [
					{ game: { equals: gameId } },
					{ round: { equals: roundToCheck } },
					{ voter: { equals: voter.id } },
					{ voteType: { equals: voteType } },
				],
			},
			limit: 1,
		});

		if (existingVotes.docs.length > 0) {
			return NextResponse.json(
				{ error: "Already voted this round" },
				{ status: 400 },
			);
		}

		// Determine if vote is correct
		let isCorrect = false;
		if (voteType === "author") {
			isCorrect = votedPlayerId === game.currentPlayerId;
		} else {
			const statement = await payload.findByID({
				collection: "statements",
				id: votedStatementId,
			});
			isCorrect = statement?.isTrue === true;
		}

		// Create vote
		await payload.create({
			collection: "votes",
			data: {
				game: gameId,
				round: roundToCheck,
				voter: voter.id,
				voteType,
				votedPlayer: voteType === "author" ? votedPlayerId : undefined,
				votedStatement: voteType === "truth" ? votedStatementId : undefined,
				isCorrect,
			},
		});

		// Check if all votes are in and auto-advance
		const allPlayers = await payload.find({
			collection: "players",
			where: { game: { equals: gameId } },
		});
		const eligibleVoters = allPlayers.docs.filter(
			(p) => p.id !== game.currentPlayerId,
		).length;

		const currentVotes = await payload.count({
			collection: "votes",
			where: {
				and: [
					{ game: { equals: gameId } },
					{ round: { equals: roundToCheck } },
					{ voteType: { equals: voteType } },
				],
			},
		});

		let autoAdvanced = false;
		let newStatus: GameStatus | undefined;
		let newRound = game.currentRound;
		let newTruthRound = game.truthRound;
		let newCurrentPlayerId = game.currentPlayerId;

		const playerOrder = (game.playerOrder as string[]) || [];
		const totalPlayers = playerOrder.length;

		if (currentVotes.totalDocs >= eligibleVoters) {
			// All votes are in for this round
			if (voteType === "author") {
				// Author voting: move to next player or go to results-author
				if (game.currentRound < totalPlayers) {
					// More players to vote on - advance to next player's statements
					newRound = game.currentRound + 1;
					newCurrentPlayerId = playerOrder[newRound - 1];
					newStatus = "voting-author";
				} else {
					// All author rounds complete - calculate all points and show results
					await calculateAllAuthorPoints(payload, gameId, playerOrder);
					newStatus = "results-author";
				}
			} else {
				// Truth voting: calculate points for this round and show results
				await calculateTruthPoints(
					payload,
					gameId,
					game.truthRound,
					game.currentPlayerId as string,
				);
				newStatus = "results-truth";
			}

			await payload.update({
				collection: "games",
				id: gameId,
				data: {
					status: newStatus,
					currentRound: newRound,
					truthRound: newTruthRound,
					currentPlayerId: newCurrentPlayerId,
				},
			});
			autoAdvanced = true;
		}

		return NextResponse.json({
			success: true,
			message: "Vote submitted",
			autoAdvanced,
			newStatus,
		});
	} catch (error) {
		console.error("Error submitting vote:", error);
		return NextResponse.json(
			{ error: "Failed to submit vote" },
			{ status: 500 },
		);
	}
}

/**
 * Award points for ALL author guesses at once (after all author rounds complete)
 */
async function calculateAllAuthorPoints(
	payload: Awaited<ReturnType<typeof getPayload>>,
	gameId: string,
	playerOrder: string[],
) {
	// Go through each round and award points for correct guesses
	for (let round = 1; round <= playerOrder.length; round++) {
		const votes = await payload.find({
			collection: "votes",
			where: {
				and: [
					{ game: { equals: gameId } },
					{ round: { equals: round } },
					{ voteType: { equals: "author" } },
					{ isCorrect: { equals: true } },
				],
			},
		});

		// Award 1 point to each correct voter
		for (const vote of votes.docs) {
			const voterId = typeof vote.voter === "object" ? vote.voter.id : vote.voter;
			const voter = await payload.findByID({
				collection: "players",
				id: voterId,
			});

			await payload.update({
				collection: "players",
				id: voterId,
				data: { score: (voter.score || 0) + 1 },
			});
		}
	}
}

/**
 * Award points for correct truth guesses and fooling others
 */
async function calculateTruthPoints(
	payload: Awaited<ReturnType<typeof getPayload>>,
	gameId: string,
	round: number,
	currentPlayerId: string,
) {
	// Get all truth votes this round
	const votes = await payload.find({
		collection: "votes",
		where: {
			and: [
				{ game: { equals: gameId } },
				{ round: { equals: round } },
				{ voteType: { equals: "truth" } },
			],
		},
	});

	const currentPlayer = await payload.findByID({
		collection: "players",
		id: currentPlayerId,
	});

	let foolingPoints = 0;

	for (const vote of votes.docs) {
		const voterId = typeof vote.voter === "object" ? vote.voter.id : vote.voter;
		const voter = await payload.findByID({
			collection: "players",
			id: voterId,
		});

		if (vote.isCorrect) {
			// Award 1 point for correct guess
			await payload.update({
				collection: "players",
				id: voterId,
				data: { score: (voter.score || 0) + 1 },
			});
		} else {
			// Statement author gets a point for fooling someone
			foolingPoints++;
		}
	}

	// Award fooling points to statement author
	if (foolingPoints > 0) {
		await payload.update({
			collection: "players",
			id: currentPlayerId,
			data: { score: (currentPlayer.score || 0) + foolingPoints },
		});
	}
}
