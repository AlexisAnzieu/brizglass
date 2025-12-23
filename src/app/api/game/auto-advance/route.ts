import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Game } from "@/payload-types";

type GameStatus = NonNullable<Game["status"]>;

/**
 * POST /api/game/auto-advance
 * Auto-advance from results phase to next phase (called by frontend timer)
 * Body: { gameId: string }
 *
 * Flow:
 * - results-author -> voting-truth (start truth phase with truthRound 1)
 * - results-truth -> voting-truth (next player) OR finished (if last player)
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

		const playerOrder = (game.playerOrder as string[]) || [];
		const totalPlayers = playerOrder.length;

		let newStatus: GameStatus;
		let newTruthRound = game.truthRound;
		let newCurrentPlayerId = game.currentPlayerId;

		switch (game.status) {
			case "results-author":
				// Start truth voting phase with first player
				newStatus = "voting-truth";
				newTruthRound = 1;
				newCurrentPlayerId = playerOrder[0];
				break;

			case "results-truth": {
				// Move to next player's truth voting or finish
				if (game.truthRound < totalPlayers) {
					// More players to vote on
					newTruthRound = game.truthRound + 1;
					newCurrentPlayerId = playerOrder[newTruthRound - 1];
					newStatus = "voting-truth";
				} else {
					// All truth rounds complete - game finished
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

		const isFinishing = newStatus === "finished";

		// Update game
		await payload.update({
			collection: "games",
			id: gameId,
			data: {
				status: newStatus,
				truthRound: newTruthRound,
				currentPlayerId: newCurrentPlayerId,
			},
		});

		return NextResponse.json({
			success: true,
			newStatus,
			truthRound: newTruthRound,
			currentPlayerId: newCurrentPlayerId,
			isFinishing,
		});
	} catch (error) {
		console.error("Error auto-advancing game phase:", error);
		return NextResponse.json(
			{ error: "Failed to auto-advance game phase" },
			{ status: 500 },
		);
	}
}
