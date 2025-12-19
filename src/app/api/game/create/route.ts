import config from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

/**
 * Generate a random game code (6 characters, uppercase alphanumeric)
 */
function generateGameCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluding similar chars like 0/O, 1/I
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}

/**
 * Generate a random token (32 characters)
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
 * POST /api/game/create
 * Creates a new game and returns the game code + admin token
 */
export async function POST() {
	try {
		const payload = await getPayload({ config });

		// Generate unique game code
		let code = generateGameCode();
		let attempts = 0;
		while (attempts < 10) {
			const existing = await payload.find({
				collection: "games",
				where: { code: { equals: code } },
				limit: 1,
			});
			if (existing.docs.length === 0) break;
			code = generateGameCode();
			attempts++;
		}

		if (attempts >= 10) {
			return NextResponse.json(
				{ error: "Failed to generate unique game code" },
				{ status: 500 },
			);
		}

		const adminToken = generateToken();

		const game = await payload.create({
			collection: "games",
			data: {
				code,
				status: "lobby",
				currentRound: 0,
				adminToken,
			},
		});

		return NextResponse.json({
			success: true,
			game: {
				id: game.id,
				code: game.code,
				adminToken: game.adminToken,
			},
		});
	} catch (error) {
		console.error("Error creating game:", error);
		return NextResponse.json(
			{ error: "Failed to create game" },
			{ status: 500 },
		);
	}
}
