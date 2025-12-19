import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import type { Media, Player } from "@/payload-types";

/**
 * Get avatar URL from player's avatar field
 */
function getAvatarUrl(player: Player): string | null {
	if (!player.avatar) return null;
	const avatar = player.avatar as Media;
	return avatar.sizes?.thumbnail?.url || avatar.url || null;
}

/**
 * GET /api/game/[code]/status
 * Get current game status, players, and round info
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ code: string }> },
) {
	try {
		const { code } = await params;
		const sessionToken = request.cookies.get("playerSession")?.value;

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

		// Get all players in the game
		const players = await payload.find({
			collection: "players",
			where: { game: { equals: game.id } },
			sort: "-score",
			depth: 1,
		});

		// Get current player info if session exists
		let currentPlayer = null;
		if (sessionToken) {
			const playerResult = await payload.find({
				collection: "players",
				where: {
					and: [
						{ sessionToken: { equals: sessionToken } },
						{ game: { equals: game.id } },
					],
				},
				limit: 1,
				depth: 1,
			});
			currentPlayer = playerResult.docs[0] || null;
		}

		// Get statements for current round (if in voting phase)
		let currentStatements = null;
		let currentRoundPlayer = null;
		if (
			game.currentPlayerId &&
			[
				"voting-author",
				"results-author",
				"voting-truth",
				"results-truth",
			].includes(game.status)
		) {
			const statementsResult = await payload.find({
				collection: "statements",
				where: {
					and: [
						{ game: { equals: game.id } },
						{ player: { equals: game.currentPlayerId } },
					],
				},
				sort: "order",
			});

			// Don't reveal isTrue during voting phases
			currentStatements = statementsResult.docs.map((s) => ({
				id: s.id,
				text: s.text,
				order: s.order,
				// Only show isTrue in results phases
				isTrue: ["results-author", "results-truth", "finished"].includes(
					game.status,
				)
					? s.isTrue
					: undefined,
			}));

			// Get the player whose statements are being guessed
			currentRoundPlayer = await payload.findByID({
				collection: "players",
				id: game.currentPlayerId,
				depth: 1,
			});
		}

		// Check if current player has voted this round
		let hasVotedAuthor = false;
		let hasVotedTruth = false;
		if (currentPlayer && game.currentRound > 0) {
			const authorVote = await payload.find({
				collection: "votes",
				where: {
					and: [
						{ game: { equals: game.id } },
						{ round: { equals: game.currentRound } },
						{ voter: { equals: currentPlayer.id } },
						{ voteType: { equals: "author" } },
					],
				},
				limit: 1,
			});
			hasVotedAuthor = authorVote.docs.length > 0;

			const truthVote = await payload.find({
				collection: "votes",
				where: {
					and: [
						{ game: { equals: game.id } },
						{ round: { equals: game.currentRound } },
						{ voter: { equals: currentPlayer.id } },
						{ voteType: { equals: "truth" } },
					],
				},
				limit: 1,
			});
			hasVotedTruth = truthVote.docs.length > 0;
		}

		// Get vote results for results phases
		let voteResults = null;
		if (["results-author", "results-truth"].includes(game.status)) {
			const voteType = game.status === "results-author" ? "author" : "truth";
			const votes = await payload.find({
				collection: "votes",
				where: {
					and: [
						{ game: { equals: game.id } },
						{ round: { equals: game.currentRound } },
						{ voteType: { equals: voteType } },
					],
				},
				depth: 1,
			});

			voteResults = votes.docs.map((v) => ({
				voter: typeof v.voter === "object" ? v.voter.nickname : v.voter,
				votedPlayer:
					typeof v.votedPlayer === "object"
						? v.votedPlayer?.nickname
						: v.votedPlayer,
				votedStatement:
					typeof v.votedStatement === "object"
						? v.votedStatement?.id
						: v.votedStatement,
				isCorrect: v.isCorrect,
			}));
		}

		// Calculate how many players need to vote
		const eligibleVoters = players.docs.filter(
			(p) => p.id !== game.currentPlayerId,
		).length;
		const currentVotes =
			game.currentRound > 0
				? await payload.count({
						collection: "votes",
						where: {
							and: [
								{ game: { equals: game.id } },
								{ round: { equals: game.currentRound } },
								{
									voteType: {
										equals:
											game.status === "voting-author" ? "author" : "truth",
									},
								},
							],
						},
					})
				: { totalDocs: 0 };

		return NextResponse.json({
			game: {
				id: game.id,
				code: game.code,
				status: game.status,
				currentRound: game.currentRound,
			},
			players: players.docs.map((p) => ({
				id: p.id,
				nickname: p.nickname,
				score: p.score,
				hasSubmittedStatements: p.hasSubmittedStatements,
				isCurrentRoundPlayer: p.id === game.currentPlayerId,
				avatarUrl: getAvatarUrl(p),
			})),
			currentPlayer: currentPlayer
				? {
						id: currentPlayer.id,
						nickname: currentPlayer.nickname,
						hasSubmittedStatements: currentPlayer.hasSubmittedStatements,
						hasVotedAuthor,
						hasVotedTruth,
						isCurrentRoundPlayer: currentPlayer.id === game.currentPlayerId,
						avatarUrl: getAvatarUrl(currentPlayer),
					}
				: null,
			currentRound:
				game.currentRound > 0
					? {
							playerNickname: currentRoundPlayer?.nickname,
							playerAvatarUrl: currentRoundPlayer
								? getAvatarUrl(currentRoundPlayer)
								: null,
							playerId: game.currentPlayerId,
							statements: currentStatements,
							voteResults,
							votesReceived: currentVotes.totalDocs,
							votesNeeded: eligibleVoters,
						}
					: null,
		});
	} catch (error) {
		console.error("Error fetching game status:", error);
		return NextResponse.json(
			{ error: "Failed to fetch game status" },
			{ status: 500 },
		);
	}
}
