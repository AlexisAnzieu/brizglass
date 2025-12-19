import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

/**
 * POST /api/game/start
 * Start the game (admin only)
 * Body: { gameId: string, adminToken: string }
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

		if (game.status !== "lobby") {
			return NextResponse.json(
				{ error: "Game has already started" },
				{ status: 400 },
			);
		}

		// Get all players who have submitted statements
		const players = await payload.find({
			collection: "players",
			where: {
				and: [
					{ game: { equals: gameId } },
					{ hasSubmittedStatements: { equals: true } },
				],
			},
		});

		if (players.docs.length < 2) {
			return NextResponse.json(
				{
					error:
						"At least 2 players with submitted statements are required to start",
				},
				{ status: 400 },
			);
		}

		// Select first player who hasn't been guessed yet
		const firstPlayer = players.docs.find((p) => !p.hasBeenGuessed);
		if (!firstPlayer) {
			return NextResponse.json(
				{ error: "No players available for guessing" },
				{ status: 400 },
			);
		}

		// Update game to start
		await payload.update({
			collection: "games",
			id: gameId,
			data: {
				status: "voting-author",
				currentRound: 1,
				currentPlayerId: firstPlayer.id,
			},
		});

		return NextResponse.json({
			success: true,
			message: "Game started",
			currentRound: 1,
			currentPlayerId: firstPlayer.id,
		});
	} catch (error) {
		console.error("Error starting game:", error);
		return NextResponse.json(
			{ error: "Failed to start game" },
			{ status: 500 },
		);
	}
}
