import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

/**
 * Generate a random session token (32 characters)
 */
function generateToken(): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let token = "";
	for (let i = 0; i < 32; i++) {
		token += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return token;
}

/**
 * POST /api/game/join
 * Join an existing game with a nickname
 * Body: { code: string, nickname: string }
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { code, nickname } = body;

		if (!code || !nickname) {
			return NextResponse.json(
				{ error: "Game code and nickname are required" },
				{ status: 400 },
			);
		}

		if (nickname.length < 2 || nickname.length > 20) {
			return NextResponse.json(
				{ error: "Nickname must be between 2 and 20 characters" },
				{ status: 400 },
			);
		}

		const payload = await getPayload({ config });

		// Find the game
		const games = await payload.find({
			collection: "games",
			where: { code: { equals: code.toUpperCase() } },
			limit: 1,
		});

		if (games.docs.length === 0) {
			return NextResponse.json({ error: "Game not found" }, { status: 404 });
		}

		const game = games.docs[0];

		if (game.status !== "lobby") {
			return NextResponse.json(
				{ error: "Game has already started" },
				{ status: 400 },
			);
		}

		// Check if nickname is already taken in this game
		const existingPlayers = await payload.find({
			collection: "players",
			where: {
				and: [
					{ game: { equals: game.id } },
					{ nickname: { equals: nickname } },
				],
			},
			limit: 1,
		});

		if (existingPlayers.docs.length > 0) {
			return NextResponse.json(
				{ error: "Nickname already taken in this game" },
				{ status: 400 },
			);
		}

		const sessionToken = generateToken();

		const player = await payload.create({
			collection: "players",
			data: {
				nickname,
				game: game.id,
				sessionToken,
				score: 0,
				hasSubmittedStatements: false,
				hasBeenGuessed: false,
			},
		});

		// Set session cookie
		const response = NextResponse.json({
			success: true,
			player: {
				id: player.id,
				nickname: player.nickname,
				sessionToken: player.sessionToken,
			},
			game: {
				id: game.id,
				code: game.code,
			},
		});

		response.cookies.set("playerSession", sessionToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 60 * 60 * 24, // 24 hours
		});

		return response;
	} catch (error) {
		console.error("Error joining game:", error);
		return NextResponse.json({ error: "Failed to join game" }, { status: 500 });
	}
}
