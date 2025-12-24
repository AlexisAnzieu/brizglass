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
 *
 * Game Flow:
 * - voting-author: Players vote on who wrote each set of statements (all rounds, no reveals)
 * - results-author: Show ALL author results at once
 * - voting-truth: Vote on which statement is true (one player at a time)
 * - results-truth: Reveal truth for one player, then back to voting-truth
 * - finished: Game complete
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
		const playerOrder = (game.playerOrder as string[]) || [];
		const truthRound = game.truthRound || 0;

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

		// Determine which round to use for vote checking based on phase
		const isAuthorPhase =
			game.status === "voting-author" || game.status === "results-author";
		const roundForVoteCheck = isAuthorPhase ? game.currentRound : truthRound;

		// Get statements for current round (if in voting phase)
		let currentStatements = null;
		let currentRoundPlayer = null;
		if (
			game.currentPlayerId &&
			["voting-author", "voting-truth", "results-truth"].includes(game.status)
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
				// Only show isTrue in results-truth and finished phases
				isTrue: ["results-truth", "finished"].includes(game.status)
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
		if (currentPlayer && roundForVoteCheck > 0) {
			// For author phase, check current round
			if (game.currentRound > 0) {
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
			}

			// For truth phase, check truth round
			if (truthRound > 0) {
				const truthVote = await payload.find({
					collection: "votes",
					where: {
						and: [
							{ game: { equals: game.id } },
							{ round: { equals: truthRound } },
							{ voter: { equals: currentPlayer.id } },
							{ voteType: { equals: "truth" } },
						],
					},
					limit: 1,
				});
				hasVotedTruth = truthVote.docs.length > 0;
			}
		}

		// Get vote results for results phases
		let voteResults = null;
		let allAuthorResults = null;

		if (game.status === "results-author") {
			// For results-author, show ALL author results for ALL rounds
			const totalPlayers = playerOrder.length;
			allAuthorResults = [];

			for (let round = 1; round <= totalPlayers; round++) {
				const playerId = playerOrder[round - 1];
				const player = players.docs.find((p) => p.id === playerId);

				// Get statements for this player
				const statementsResult = await payload.find({
					collection: "statements",
					where: {
						and: [
							{ game: { equals: game.id } },
							{ player: { equals: playerId } },
						],
					},
					sort: "order",
				});

				// Get all votes for this round
				const votes = await payload.find({
					collection: "votes",
					where: {
						and: [
							{ game: { equals: game.id } },
							{ round: { equals: round } },
							{ voteType: { equals: "author" } },
						],
					},
					depth: 1,
				});

				allAuthorResults.push({
					round,
					playerId,
					playerNickname: player?.nickname,
					playerAvatarUrl: player ? getAvatarUrl(player) : null,
					statements: statementsResult.docs.map((s) => ({
						id: s.id,
						text: s.text,
						order: s.order,
					})),
					votes: votes.docs.map((v) => ({
						voter: typeof v.voter === "object" ? v.voter.nickname : v.voter,
						votedPlayer:
							typeof v.votedPlayer === "object"
								? v.votedPlayer?.nickname
								: v.votedPlayer,
						isCorrect: v.isCorrect,
					})),
				});
			}
		} else if (game.status === "results-truth") {
			// For results-truth, show results for current truth round
			const votes = await payload.find({
				collection: "votes",
				where: {
					and: [
						{ game: { equals: game.id } },
						{ round: { equals: truthRound } },
						{ voteType: { equals: "truth" } },
					],
				},
				depth: 1,
			});

			voteResults = votes.docs.map((v) => ({
				voter: typeof v.voter === "object" ? v.voter.nickname : v.voter,
				votedStatement:
					typeof v.votedStatement === "object"
						? v.votedStatement?.id
						: v.votedStatement,
				isCorrect: v.isCorrect,
			}));
		}

		// Calculate who can vote (everyone except the current round player)
		const eligibleVoters = players.docs.filter(
			(p) => p.id !== game.currentPlayerId,
		);

		// Get current votes with voter info for real-time status display
		let currentVotesData: { totalDocs: number; voterIds: string[] } = { totalDocs: 0, voterIds: [] };
		if (game.status === "voting-author" && game.currentRound > 0) {
			// For voting-author, only count votes (don't reveal who voted to avoid exposing the author)
			const votesCount = await payload.count({
				collection: "votes",
				where: {
					and: [
						{ game: { equals: game.id } },
						{ round: { equals: game.currentRound } },
						{ voteType: { equals: "author" } },
					],
				},
			});
			currentVotesData = {
				totalDocs: votesCount.totalDocs,
				voterIds: [], // Don't expose voter IDs during author phase
			};
		} else if (game.status === "voting-truth" && truthRound > 0) {
			// For voting-truth, we can show who voted since the author is already known
			const votesResult = await payload.find({
				collection: "votes",
				where: {
					and: [
						{ game: { equals: game.id } },
						{ round: { equals: truthRound } },
						{ voteType: { equals: "truth" } },
					],
				},
				limit: 100,
			});
			currentVotesData = {
				totalDocs: votesResult.totalDocs,
				voterIds: votesResult.docs.map((v) => 
					typeof v.voter === "object" ? v.voter.id : v.voter
				),
			};
		}

		// Build voter status list (only for voting-truth phase where author is already revealed)
		const voterStatus = game.status === "voting-truth" 
			? eligibleVoters.map((p) => ({
					id: p.id,
					nickname: p.nickname,
					avatarUrl: getAvatarUrl(p),
					hasVoted: currentVotesData.voterIds.includes(p.id),
				}))
			: undefined;

		return NextResponse.json({
			game: {
				id: game.id,
				code: game.code,
				status: game.status,
				currentRound: game.currentRound,
				truthRound,
				totalPlayers: playerOrder.length,
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
				(game.status === "voting-author" ||
					game.status === "voting-truth" ||
					game.status === "results-truth") &&
				currentRoundPlayer
					? {
							playerNickname: currentRoundPlayer?.nickname,
							playerAvatarUrl: currentRoundPlayer
								? getAvatarUrl(currentRoundPlayer)
								: null,
							playerId: game.currentPlayerId,
							statements: currentStatements,
							voteResults,
							votesReceived: currentVotesData.totalDocs,
							votesNeeded: eligibleVoters.length,
							...(voterStatus && { voterStatus }),
						}
					: null,
			// All author results shown during results-author phase
			allAuthorResults,
		});
	} catch (error) {
		console.error("Error fetching game status:", error);
		return NextResponse.json(
			{ error: "Failed to fetch game status" },
			{ status: 500 },
		);
	}
}
