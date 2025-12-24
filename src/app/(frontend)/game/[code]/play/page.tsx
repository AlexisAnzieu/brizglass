"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePartySocket } from "@/hooks/usePartySocket";

interface Statement {
	id: string;
	text: string;
	order: number;
	isTrue?: boolean;
}

interface Player {
	id: string;
	nickname: string;
	score: number;
	hasSubmittedStatements: boolean;
	isCurrentRoundPlayer: boolean;
	avatarUrl: string | null;
}

interface CurrentPlayer {
	id: string;
	nickname: string;
	hasSubmittedStatements: boolean;
	hasVotedAuthor: boolean;
	hasVotedTruth: boolean;
	isCurrentRoundPlayer: boolean;
	avatarUrl: string | null;
}

interface AuthorRoundResult {
	round: number;
	playerId: string;
	playerNickname: string;
	playerAvatarUrl: string | null;
	statements: Statement[];
	votes: {
		voter: string;
		votedPlayer?: string;
		isCorrect: boolean;
	}[];
}

interface VoterStatus {
	id: string;
	nickname: string;
	avatarUrl: string | null;
	hasVoted: boolean;
}

interface GameStatus {
	game: {
		id: string;
		code: string;
		status: string;
		currentRound: number;
		truthRound: number;
		totalPlayers: number;
	};
	players: Player[];
	currentPlayer: CurrentPlayer | null;
	currentRound?: {
		playerNickname: string;
		playerAvatarUrl: string | null;
		playerId: string;
		statements: Statement[];
		voteResults?: {
			voter: string;
			votedPlayer?: string;
			votedStatement?: string;
			isCorrect: boolean;
		}[];
		votesReceived: number;
		votesNeeded: number;
		voterStatus?: VoterStatus[];
	};
	allAuthorResults?: AuthorRoundResult[];
}

function PlayerAvatar({
	avatarUrl,
	nickname,
	size = "small",
}: {
	avatarUrl: string | null;
	nickname: string;
	size?: "small" | "medium" | "large";
}) {
	const sizeClasses = {
		small: "avatar-small",
		medium: "avatar-medium",
		large: "avatar-large",
	};

	if (avatarUrl) {
		return (
			<img
				src={avatarUrl}
				alt={`${nickname}'s avatar`}
				className={`player-avatar ${sizeClasses[size]}`}
			/>
		);
	}

	return (
		<div className={`player-avatar-placeholder ${sizeClasses[size]}`}>
			{nickname.charAt(0).toUpperCase()}
		</div>
	);
}

export default function PlayPage() {
	const router = useRouter();
	const params = useParams();
	const code = params.code as string;

	const [gameStatus, setGameStatus] = useState<GameStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Statement submission state
	const [statements, setStatements] = useState([
		{ text: "", isTrue: false },
		{ text: "", isTrue: false },
		{ text: "", isTrue: true },
	]);
	const [submitting, setSubmitting] = useState(false);

	// Voting state
	const [selectedVote, setSelectedVote] = useState<string | null>(null);
	const [voting, setVoting] = useState(false);

	// Auto-advance timer state
	const [countdown, setCountdown] = useState<number | null>(null);
	const countdownRef = useRef<NodeJS.Timeout | null>(null);
	const hasAutoAdvancedRef = useRef<string | null>(null);

	// Final countdown state (5 seconds before showing results)
	const [finalCountdown, setFinalCountdown] = useState<number | null>(null);
	const [showFinalResults, setShowFinalResults] = useState(false);

	const fetchStatus = useCallback(async () => {
		try {
			const response = await fetch(`/api/game/${code}/status`);
			const data = await response.json();

			if (data.error) {
				if (data.error === "Game not found") {
					router.push("/");
					return;
				}
				setError(data.error);
			} else {
				if (!data.currentPlayer) {
					router.push(`/game/${code}/join`);
					return;
				}
				setGameStatus(data);
			}
		} catch {
			setError("Échec du chargement de la partie");
		} finally {
			setLoading(false);
		}
	}, [code, router]);

	// Use PartyKit for real-time updates
	const { notifyPlayerReady, notifyVoteSubmitted, notifyPhaseChanged } =
		usePartySocket({
			gameCode: code,
			onGameUpdate: fetchStatus,
			onPlayerJoined: fetchStatus,
			onPlayerReady: fetchStatus,
			onGameStarted: fetchStatus,
			onVoteSubmitted: fetchStatus,
			onPhaseChanged: fetchStatus,
		});

	// Auto-advance function for results phases
	const autoAdvance = useCallback(async () => {
		if (!gameStatus?.game.id) return;

		try {
			const response = await fetch("/api/game/auto-advance", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ gameId: gameStatus.game.id }),
			});
			const data = await response.json();
			if (data.success) {
				// If finishing, start 5-second final countdown
				if (data.isFinishing) {
					setFinalCountdown(5);
					const finalInterval = setInterval(() => {
						setFinalCountdown((prev) => {
							if (prev === null || prev <= 1) {
								clearInterval(finalInterval);
								setShowFinalResults(true);
								fetchStatus();
								return null;
							}
							return prev - 1;
						});
					}, 1000);
				} else {
					notifyPhaseChanged(data.newStatus);
					fetchStatus();
				}
			}
		} catch (error) {
			console.error("Auto-advance failed:", error);
		}
	}, [gameStatus?.game.id, notifyPhaseChanged, fetchStatus]);

	// Handle countdown timer for results phases
	useEffect(() => {
		const isResultsPhase =
			gameStatus?.game.status === "results-author" ||
			gameStatus?.game.status === "results-truth";
		// Use truthRound for truth phase, currentRound for author phase
		const roundForKey =
			gameStatus?.game.status === "results-truth"
				? gameStatus?.game.truthRound
				: gameStatus?.game.currentRound;
		const phaseKey = `${gameStatus?.game.status}-${roundForKey}`;

		if (isResultsPhase && hasAutoAdvancedRef.current !== phaseKey) {
			// Start countdown when entering results phase
			setCountdown(20);

			// Clear any existing interval
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
			}

			countdownRef.current = setInterval(() => {
				setCountdown((prev) => {
					if (prev === null || prev <= 1) {
						// Clear interval and auto-advance
						if (countdownRef.current) {
							clearInterval(countdownRef.current);
							countdownRef.current = null;
						}
						// Mark this phase as auto-advanced
						hasAutoAdvancedRef.current = phaseKey;
						// Trigger auto-advance
						autoAdvance();
						return null;
					}
					return prev - 1;
				});
			}, 1000);
		} else if (!isResultsPhase) {
			// Clear countdown when leaving results phase
			setCountdown(null);
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
				countdownRef.current = null;
			}
		}

		return () => {
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
				countdownRef.current = null;
			}
		};
	}, [
		gameStatus?.game.status,
		gameStatus?.game.currentRound,
		gameStatus?.game.truthRound,
		autoAdvance,
	]);

	// Show final results immediately if page is loaded with finished status
	useEffect(() => {
		if (
			gameStatus?.game.status === "finished" &&
			!showFinalResults &&
			finalCountdown === null
		) {
			setShowFinalResults(true);
		}
	}, [gameStatus?.game.status, showFinalResults, finalCountdown]);

	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	const handleStatementChange = (index: number, text: string) => {
		const newStatements = [...statements];
		newStatements[index].text = text;
		setStatements(newStatements);
	};

	const handleTruthToggle = (index: number) => {
		const newStatements = statements.map((s, i) => ({
			...s,
			isTrue: i === index,
		}));
		setStatements(newStatements);
	};

	const handleSubmitStatements = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setError("");

		try {
			const response = await fetch("/api/game/statements", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ statements }),
			});

			const data = await response.json();

			if (!data.success) {
				setError(data.error || "Échec de l'envoi des affirmations");
			} else {
				// Notify other clients that player is ready
				notifyPlayerReady(gameStatus?.currentPlayer?.id || "");
				fetchStatus();
			}
		} catch {
			setError("Échec de l'envoi des affirmations");
		} finally {
			setSubmitting(false);
		}
	};

	const handleVote = async (voteType: "author" | "truth") => {
		if (!selectedVote) return;
		setVoting(true);
		setError("");

		try {
			const body: {
				voteType: string;
				votedPlayerId?: string;
				votedStatementId?: string;
			} = { voteType };
			if (voteType === "author") {
				body.votedPlayerId = selectedVote;
			} else {
				body.votedStatementId = selectedVote;
			}

			const response = await fetch("/api/game/vote", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			const data = await response.json();

			if (!data.success) {
				setError(data.error || "Échec de l'envoi du vote");
			} else {
				setSelectedVote(null);
				// Notify other clients that a vote was submitted
				notifyVoteSubmitted();
				fetchStatus();
			}
		} catch {
			setError("Échec de l'envoi du vote");
		} finally {
			setVoting(false);
		}
	};

	if (loading) {
		return <div className="loading">Chargement...</div>;
	}

	if (!gameStatus || !gameStatus.currentPlayer) {
		return <div className="error-page">Impossible de charger la partie</div>;
	}

	const { game, players, currentPlayer, currentRound } = gameStatus;

	return (
		<div className="play-container">
			<div className="play-header">
				<h1>Partie : {code}</h1>
				<span className="player-badge">
					<PlayerAvatar
						avatarUrl={currentPlayer.avatarUrl}
						nickname={currentPlayer.nickname}
						size="small"
					/>
					Vous jouez en tant que : {currentPlayer.nickname}
				</span>
			</div>

			{error && <p className="error">{error}</p>}

			{/* Lobby - Statement Submission */}
			{game.status === "lobby" && !currentPlayer.hasSubmittedStatements && (
				<div className="statements-section">
					<h2>Écrivez vos affirmations</h2>
					<p>
						Écrivez 2 mensonges et 1 vérité sur vous. Les autres devront deviner
						laquelle est vraie !
					</p>

					<form onSubmit={handleSubmitStatements} className="statements-form">
						{statements.map((statement, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: Fixed-length array (always 3 statements) that never reorders
							<div key={`statement-${index}`} className="statement-input">
								<label htmlFor={`statement-${index}`}>
									Affirmation {index + 1}
									<span
										className={`truth-badge ${statement.isTrue ? "true" : "false"}`}
									>
										{statement.isTrue ? "✅ VÉRITÉ" : "❌ MENSONGE"}
									</span>
								</label>
								<textarea
									id={`statement-${index}`}
									value={statement.text}
									onChange={(e) => handleStatementChange(index, e.target.value)}
									placeholder={
										statement.isTrue
											? "Écrivez quelque chose de VRAI sur vous..."
											: "Écrivez un MENSONGE crédible..."
									}
									required
									minLength={3}
								/>
								<button
									type="button"
									onClick={() => handleTruthToggle(index)}
									className={`btn btn-small ${statement.isTrue ? "btn-success" : "btn-outline"}`}
								>
									{statement.isTrue ? "C'est VRAI" : "Marquer comme VRAI"}
								</button>
							</div>
						))}

						<button
							type="submit"
							disabled={
								submitting || statements.some((s) => s.text.trim().length < 3)
							}
							className="btn btn-primary btn-large"
						>
							{submitting ? "Envoi..." : "Envoyer les affirmations"}
						</button>
					</form>
				</div>
			)}

			{/* Lobby - Waiting */}
			{game.status === "lobby" && currentPlayer.hasSubmittedStatements && (
				<div className="waiting-section">
					<h2>✅ Affirmations envoyées !</h2>
					<p>En attente des autres joueurs et du démarrage de la partie...</p>

					<div className="players-waiting">
						<h3>Joueurs</h3>
						{players.map((player) => (
							<div key={player.id} className="player-row">
								<span className="player-info">
									<PlayerAvatar
										avatarUrl={player.avatarUrl}
										nickname={player.nickname}
										size="small"
									/>
									{player.nickname}
								</span>
								<span>
									{player.hasSubmittedStatements ? "✅ Prêt" : "⏳ Écrit..."}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Voting on Author */}
			{game.status === "voting-author" && currentRound && (
				<div className="voting-section">
					<h2>Qui a écrit ces affirmations ?</h2>
					<p className="round-progress">
						Joueur {game.currentRound} / {game.totalPlayers}
					</p>

					<div className="statements-display">
						{currentRound.statements.map((statement, index) => (
							<div key={statement.id} className="statement-card">
								<span className="statement-number">{index + 1}</span>
								<span className="statement-text">{statement.text}</span>
							</div>
						))}
					</div>

					{currentPlayer.isCurrentRoundPlayer ? (
						<div className="your-turn">
							<p>
								🎯 Ce sont VOS affirmations ! Attendez que les autres devinent.
							</p>
						</div>
					) : currentPlayer.hasVotedAuthor ? (
						<div className="voted">
							<p>✅ Vote envoyé ! En attente des autres...</p>
							<p>
								Votes : {currentRound.votesReceived} /{" "}
								{currentRound.votesNeeded}
							</p>
						</div>
					) : (
						<div className="vote-options">
							<h3>Sélectionnez qui vous pensez avoir écrit ceci :</h3>
							{players
								.filter((p) => p.id !== currentPlayer.id)
								.map((player) => (
									<button
										type="button"
										key={player.id}
										onClick={() => setSelectedVote(player.id)}
										className={`vote-option ${selectedVote === player.id ? "selected" : ""}`}
									>
										<PlayerAvatar
											avatarUrl={player.avatarUrl}
											nickname={player.nickname}
											size="medium"
										/>
										{player.nickname}
									</button>
								))}
							<button
								type="button"
								onClick={() => handleVote("author")}
								disabled={!selectedVote || voting}
								className="btn btn-primary"
							>
								{voting ? "Envoi..." : "Envoyer le vote"}
							</button>
						</div>
					)}
				</div>
			)}

			{/* Results - Author (ALL results at once) */}
			{game.status === "results-author" && gameStatus.allAuthorResults && (
				<div className="results-section">
					<h2>Résultats - Auteurs</h2>
					<p>Voici qui a écrit chaque série d'affirmations !</p>

					<div className="all-author-results">
						{gameStatus.allAuthorResults.map((result) => (
							<div key={result.round} className="author-result-card">
								<div className="author-reveal">
									<PlayerAvatar
										avatarUrl={result.playerAvatarUrl}
										nickname={result.playerNickname}
										size="medium"
									/>
									<strong>{result.playerNickname}</strong>
								</div>

								<div className="statements-mini">
									{result.statements.map((statement, index) => (
										<div key={statement.id} className="statement-mini">
											<span className="statement-number">{index + 1}</span>
											<span className="statement-text">{statement.text}</span>
										</div>
									))}
								</div>

								{result.votes.length > 0 && (
									<div className="vote-results">
										{result.votes.map((vote) => (
											<div
												key={`${result.round}-${vote.voter}`}
												className={`vote-result ${vote.isCorrect ? "correct" : "incorrect"}`}
											>
												<span>{vote.voter}</span>
												<span>→ {vote.votedPlayer}</span>
												<span>{vote.isCorrect ? "✅ +1" : "❌"}</span>
											</div>
										))}
									</div>
								)}
							</div>
						))}
					</div>

					<p className="countdown-timer">
						⏱️ Phase Vérité dans {countdown ?? 0} secondes...
					</p>
				</div>
			)}

			{/* Voting on Truth */}
			{game.status === "voting-truth" && currentRound && (
				<div className="voting-section">
					<h2>Quelle affirmation est VRAIE ?</h2>
					<p className="round-progress">
						Joueur {game.truthRound} / {game.totalPlayers}
					</p>
					<p className="author-reveal">
						Écrit par :{" "}
						<span className="author-name">
							<PlayerAvatar
								avatarUrl={currentRound.playerAvatarUrl}
								nickname={currentRound.playerNickname}
								size="medium"
							/>
							<strong>{currentRound.playerNickname}</strong>
						</span>
					</p>

					{currentPlayer.isCurrentRoundPlayer ? (
						<div className="your-turn">
							<div className="statements-display">
								{currentRound.statements.map((statement, index) => (
									<div key={statement.id} className="statement-card">
										<span className="statement-number">{index + 1}</span>
										<span className="statement-text">{statement.text}</span>
									</div>
								))}
							</div>
							<p>
								🎯 Ce sont VOS affirmations ! Attendez que les autres devinent.
							</p>
							{currentRound.voterStatus && (
								<div className="voter-status-list">
									{currentRound.voterStatus.map((voter) => (
										<div
											key={voter.id}
											className={`voter-status-item ${voter.hasVoted ? "voted" : "waiting"}`}
										>
											<PlayerAvatar
												avatarUrl={voter.avatarUrl}
												nickname={voter.nickname}
												size="small"
											/>
											<span className="voter-name">{voter.nickname}</span>
											<span className="voter-status-icon">
												{voter.hasVoted ? "✅" : "⏳"}
											</span>
										</div>
									))}
								</div>
							)}
						</div>
					) : currentPlayer.hasVotedTruth ? (
						<div className="voted">
							<p>✅ Vote envoyé ! En attente des autres...</p>
							<p>
								Votes : {currentRound.votesReceived} /{" "}
								{currentRound.votesNeeded}
							</p>
							{currentRound.voterStatus && (
								<div className="voter-status-list">
									{currentRound.voterStatus.map((voter) => (
										<div
											key={voter.id}
											className={`voter-status-item ${voter.hasVoted ? "voted" : "waiting"}`}
										>
											<PlayerAvatar
												avatarUrl={voter.avatarUrl}
												nickname={voter.nickname}
												size="small"
											/>
											<span className="voter-name">{voter.nickname}</span>
											<span className="voter-status-icon">
												{voter.hasVoted ? "✅" : "⏳"}
											</span>
										</div>
									))}
								</div>
							)}
						</div>
					) : (
						<div className="vote-options">
							{currentRound.statements.map((statement, index) => (
								<button
									type="button"
									key={statement.id}
									onClick={() => setSelectedVote(statement.id)}
									className={`vote-option statement-option ${selectedVote === statement.id ? "selected" : ""}`}
								>
									<span className="statement-number">{index + 1}</span>
									<span className="statement-text">{statement.text}</span>
								</button>
							))}
							<button
								type="button"
								onClick={() => handleVote("truth")}
								disabled={!selectedVote || voting}
								className="btn btn-primary"
							>
								{voting ? "Envoi..." : "Envoyer le vote"}
							</button>
						</div>
					)}
				</div>
			)}

			{/* Results - Truth */}
			{game.status === "results-truth" && currentRound && (
				<div className="results-section">
					<h2>Résultats - Vérité</h2>

					<div className="statements-display">
						{currentRound.statements.map((statement, index) => (
							<div
								key={statement.id}
								className={`statement-card ${statement.isTrue ? "true" : "false"}`}
							>
								<span className="statement-number">{index + 1}</span>
								<span className="statement-text">{statement.text}</span>
								<span className="statement-truth">
									{statement.isTrue ? "✅ VRAI" : "❌ MENSONGE"}
								</span>
							</div>
						))}
					</div>

					{currentRound.voteResults && (
						<div className="vote-results">
							{currentRound.voteResults.map((result) => (
								<div
									key={`truth-${result.voter}`}
									className={`vote-result ${result.isCorrect ? "correct" : "incorrect"}`}
								>
									<span>{result.voter}</span>
									<span>
										{result.isCorrect ? "✅ Correct ! +1" : "❌ Faux"}
									</span>
								</div>
							))}
						</div>
					)}

					<p className="countdown-timer">
						⏱️ Prochaine étape dans {countdown ?? 0} secondes...
					</p>
				</div>
			)}

			{/* Final Countdown Overlay */}
			{finalCountdown !== null && (
				<div className="final-countdown-overlay">
					<div className="final-countdown-content">
						<h2>🏆 Résultats finaux dans...</h2>
						<div className="final-countdown-number">{finalCountdown}</div>
					</div>
				</div>
			)}

			{/* Game Finished */}
			{game.status === "finished" &&
				showFinalResults &&
				(() => {
					const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
					const topScore = sortedPlayers[0]?.score ?? 0;
					return (
						<div className="finished-section">
							<h2>🎉 Partie terminée !</h2>

							<div className="final-scoreboard">
								{sortedPlayers.map((player, index) => {
									const isWinner = player.score === topScore;
									return (
										<div
											key={player.id}
											className={`final-score-row ${isWinner ? "winner" : ""} ${player.id === currentPlayer.id ? "you" : ""}`}
										>
											<span className="rank">
												{isWinner
													? "🏆"
													: index === 1 ||
															(index > 0 &&
																sortedPlayers[index - 1]?.score === topScore &&
																player.score !== topScore)
														? "🥈"
														: index === 2 ||
																(index > 1 &&
																	sortedPlayers.filter(
																		(p) => p.score > player.score,
																	).length === 1)
															? "🥉"
															: `#${index + 1}`}
											</span>
											<span className="player-name">
												<PlayerAvatar
													avatarUrl={player.avatarUrl}
													nickname={player.nickname}
													size="medium"
												/>
												{player.nickname}{" "}
												{player.id === currentPlayer.id && "(Vous)"}
											</span>
											<span className="score">{player.score} pts</span>
										</div>
									);
								})}
							</div>

							<button
								type="button"
								onClick={() => router.push("/")}
								className="btn btn-primary"
							>
								Rejouer
							</button>
						</div>
					);
				})()}

			{/* Scoreboard (always visible during active game) */}
			{!["lobby", "finished"].includes(game.status) && (
				<div className="mini-scoreboard">
					<h4>Scores</h4>
					{players
						.sort((a, b) => b.score - a.score)
						.slice(0, 5)
						.map((player) => (
							<div key={player.id} className="mini-score-row">
								<span className="player-info">
									<PlayerAvatar
										avatarUrl={player.avatarUrl}
										nickname={player.nickname}
										size="small"
									/>
									{player.nickname}
								</span>
								<span>{player.score}</span>
							</div>
						))}
				</div>
			)}
		</div>
	);
}
