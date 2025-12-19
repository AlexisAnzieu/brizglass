import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

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
		const existingVotes = await payload.find({
			collection: "votes",
			where: {
				and: [
					{ game: { equals: gameId } },
					{ round: { equals: game.currentRound } },
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
				round: game.currentRound,
				voter: voter.id,
				voteType,
				votedPlayer: voteType === "author" ? votedPlayerId : undefined,
				votedStatement: voteType === "truth" ? votedStatementId : undefined,
				isCorrect,
			},
		});

		return NextResponse.json({
			success: true,
			message: "Vote submitted",
		});
	} catch (error) {
		console.error("Error submitting vote:", error);
		return NextResponse.json(
			{ error: "Failed to submit vote" },
			{ status: 500 },
		);
	}
}
