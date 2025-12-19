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
 * Join an existing game with a nickname and optional avatar
 * Body: FormData with { code: string, nickname: string, avatar?: File }
 */
export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const code = formData.get("code") as string;
		const nickname = formData.get("nickname") as string;
		const avatarFile = formData.get("avatar") as File | null;

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

		// Upload avatar if provided
		let avatarId: string | undefined;
		if (avatarFile && avatarFile.size > 0) {
			const media = await payload.create({
				collection: "media",
				data: {
					alt: `${nickname}'s avatar`,
				},
				file: {
					data: Buffer.from(await avatarFile.arrayBuffer()),
					mimetype: avatarFile.type,
					name: avatarFile.name,
					size: avatarFile.size,
				},
			});
			avatarId = media.id;
		}

		const player = await payload.create({
			collection: "players",
			data: {
				nickname,
				game: game.id,
				sessionToken,
				score: 0,
				hasSubmittedStatements: false,
				hasBeenGuessed: false,
				...(avatarId && { avatar: avatarId }),
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
