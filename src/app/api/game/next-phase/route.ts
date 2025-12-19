import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Game } from "@/payload-types";

type GameStatus = NonNullable<Game["status"]>;

/**
 * POST /api/game/next-phase
 * Progress to next game phase (admin only)
 * Body: { gameId: string, adminToken: string }
 *
 * Phase flow:
 * voting-author -> results-author -> voting-truth -> results-truth -> (next round or finished)
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { gameId, adminToken } = body;

		if (!gameId || !adminToken) {
			return NextResponse.json(
				{ error: "Game ID and admin token are required" },
				{ status: 400 },
			);
		}

		const payload = await getPayload({ config });

		// Find and validate game
		const game = await payload.findByID({
			collection: "games",
			id: gameId,
		});

		if (!game) {
			return NextResponse.json({ error: "Game not found" }, { status: 404 });
		}

		if (game.adminToken !== adminToken) {
			return NextResponse.json(
				{ error: "Invalid admin token" },
				{ status: 403 },
			);
		}

		let newStatus: GameStatus;
		let newRound = game.currentRound;
		let newCurrentPlayerId = game.currentPlayerId;

		switch (game.status) {
			case "voting-author":
				// Calculate points for correct author guesses
				if (game.currentPlayerId) {
					await calculateAuthorPoints(
						payload,
						gameId,
						game.currentRound,
						game.currentPlayerId,
					);
				}
				newStatus = "results-author";
				break;

			case "results-author":
				newStatus = "voting-truth";
				break;

			case "voting-truth":
				// Calculate points for correct truth guesses + fooling points
				if (game.currentPlayerId) {
					await calculateTruthPoints(
						payload,
						gameId,
						game.currentRound,
						game.currentPlayerId,
					);
				}
				newStatus = "results-truth";
				break;

			case "results-truth": {
				// Mark current player as guessed
				if (game.currentPlayerId) {
					await payload.update({
						collection: "players",
						id: game.currentPlayerId,
						data: { hasBeenGuessed: true },
					});
				}

				// Find next player
				const nextPlayer = await findNextPlayer(payload, gameId);

				if (nextPlayer) {
					newStatus = "voting-author";
					newRound = game.currentRound + 1;
					newCurrentPlayerId = nextPlayer.id;
				} else {
					newStatus = "finished";
				}
				break;
			}

			default:
				return NextResponse.json(
					{ error: "Invalid game status for phase transition" },
					{ status: 400 },
				);
		}

		// Update game
		await payload.update({
			collection: "games",
			id: gameId,
			data: {
				status: newStatus,
				currentRound: newRound,
				currentPlayerId: newCurrentPlayerId,
			},
		});

		return NextResponse.json({
			success: true,
			newStatus,
			currentRound: newRound,
			currentPlayerId: newCurrentPlayerId,
		});
	} catch (error) {
		console.error("Error advancing game phase:", error);
		return NextResponse.json(
			{ error: "Failed to advance game phase" },
			{ status: 500 },
		);
	}
}

/**
 * Award points for correct author guesses
 */
async function calculateAuthorPoints(
	payload: Awaited<ReturnType<typeof getPayload>>,
	gameId: string,
	round: number,
	_correctPlayerId: string,
) {
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

	// Get the current player's statements
	const _statements = await payload.find({
		collection: "statements",
		where: {
			and: [
				{ game: { equals: gameId } },
				{ player: { equals: currentPlayerId } },
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

/**
 * Find the next player who hasn't been guessed yet
 */
async function findNextPlayer(
	payload: Awaited<ReturnType<typeof getPayload>>,
	gameId: string,
) {
	const players = await payload.find({
		collection: "players",
		where: {
			and: [
				{ game: { equals: gameId } },
				{ hasSubmittedStatements: { equals: true } },
				{ hasBeenGuessed: { equals: false } },
			],
		},
		limit: 1,
	});

	return players.docs[0] || null;
}
