import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Game } from "@/payload-types";

type GameStatus = NonNullable<Game["status"]>;

/**
 * POST /api/game/auto-advance
 * Auto-advance from results phase to next voting phase (called by frontend timer)
 * Body: { gameId: string }
 *
 * This is only valid during results phases and doesn't require admin token
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { gameId } = body;

		if (!gameId) {
			return NextResponse.json(
				{ error: "Game ID is required" },
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

		// Only allow auto-advance from results phases
		if (!["results-author", "results-truth"].includes(game.status)) {
			return NextResponse.json(
				{ error: "Can only auto-advance from results phases" },
				{ status: 400 },
			);
		}

		let newStatus: GameStatus;
		let newRound = game.currentRound;
		let newCurrentPlayerId = game.currentPlayerId;

		switch (game.status) {
			case "results-author":
				newStatus = "voting-truth";
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
					{ error: "Invalid game status for auto-advance" },
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
		console.error("Error auto-advancing game phase:", error);
		return NextResponse.json(
			{ error: "Failed to auto-advance game phase" },
			{ status: 500 },
		);
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
