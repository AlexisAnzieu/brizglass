import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

/**
 * POST /api/game/statements
 * Submit 3 statements (2 false, 1 true) for the current player
 * Body: { statements: [{ text: string, isTrue: boolean }] }
 */
export async function POST(request: NextRequest) {
	try {
		const sessionToken = request.cookies.get("playerSession")?.value;

		if (!sessionToken) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		const body = await request.json();
		const { statements } = body;

		if (!statements || !Array.isArray(statements) || statements.length !== 3) {
			return NextResponse.json(
				{ error: "Exactly 3 statements are required" },
				{ status: 400 },
			);
		}

		// Validate: exactly 1 true statement
		const trueCount = statements.filter(
			(s: { isTrue: boolean }) => s.isTrue,
		).length;
		if (trueCount !== 1) {
			return NextResponse.json(
				{ error: "Exactly 1 statement must be true" },
				{ status: 400 },
			);
		}

		// Validate: all statements have text
		for (const statement of statements) {
			if (!statement.text || statement.text.trim().length < 3) {
				return NextResponse.json(
					{ error: "All statements must have at least 3 characters" },
					{ status: 400 },
				);
			}
		}

		const payload = await getPayload({ config });

		// Find the player by session token
		const players = await payload.find({
			collection: "players",
			where: { sessionToken: { equals: sessionToken } },
			limit: 1,
			depth: 1,
		});

		if (players.docs.length === 0) {
			return NextResponse.json({ error: "Player not found" }, { status: 404 });
		}

		const player = players.docs[0];
		const gameId =
			typeof player.game === "object" ? player.game.id : player.game;

		if (player.hasSubmittedStatements) {
			return NextResponse.json(
				{ error: "Statements already submitted" },
				{ status: 400 },
			);
		}

		// Check game is still in lobby
		const game = await payload.findByID({
			collection: "games",
			id: gameId,
		});

		if (game.status !== "lobby") {
			return NextResponse.json(
				{ error: "Game has already started" },
				{ status: 400 },
			);
		}

		// Create statements
		const createdStatements = [];
		for (let i = 0; i < statements.length; i++) {
			const statement = await payload.create({
				collection: "statements",
				data: {
					text: statements[i].text.trim(),
					isTrue: statements[i].isTrue,
					player: player.id,
					game: gameId,
					order: i + 1,
				},
			});
			createdStatements.push(statement);
		}

		// Mark player as having submitted
		await payload.update({
			collection: "players",
			id: player.id,
			data: {
				hasSubmittedStatements: true,
			},
		});

		return NextResponse.json({
			success: true,
			message: "Statements submitted successfully",
		});
	} catch (error) {
		console.error("Error submitting statements:", error);
		return NextResponse.json(
			{ error: "Failed to submit statements" },
			{ status: 500 },
		);
	}
}
