"use client";

import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePartySocket } from "@/hooks/usePartySocket";

interface Player {
	id: string;
	nickname: string;
	score: number;
	hasSubmittedStatements: boolean;
	avatarUrl: string | null;
}

interface Statement {
	id: string;
	text: string;
	order: number;
	isTrue?: boolean;
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

export default function AdminPage() {
	const router = useRouter();
	const params = useParams();
	const code = params.code as string;

	const [gameStatus, setGameStatus] = useState<GameStatus | null>(null);
	const [adminToken, setAdminToken] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [actionLoading, setActionLoading] = useState(false);

	// Final countdown state
	const [finalCountdown, setFinalCountdown] = useState<number | null>(null);
	const [showFinalResults, setShowFinalResults] = useState(false);
	const previousStatusRef = useRef<string | null>(null);

	const fetchStatus = useCallback(async () => {
		try {
			const response = await fetch(`/api/game/${code}/status`);
			const data = await response.json();

			if (data.error) {
				setError(data.error);
			} else {
				setGameStatus(data);
			}
		} catch {
			setError("Failed to fetch game status");
		} finally {
			setLoading(false);
		}
	}, [code]);

	// Use PartyKit for real-time updates
	const { notifyGameStarted } = usePartySocket({
		gameCode: code,
		onGameUpdate: fetchStatus,
		onPlayerJoined: fetchStatus,
		onPlayerReady: fetchStatus,
		onGameStarted: fetchStatus,
		onVoteSubmitted: fetchStatus,
		onPhaseChanged: fetchStatus,
	});

	useEffect(() => {
		const token = localStorage.getItem(`game_${code}_admin`);
		if (!token) {
			router.push(`/game/${code}/join`);
			return;
		}
		setAdminToken(token);
		fetchStatus();
	}, [code, router, fetchStatus]);

	// Handle final countdown when game transitions to finished
	useEffect(() => {
		const currentStatus = gameStatus?.game.status;

		// If transitioning to finished and we haven't shown countdown yet
		if (
			currentStatus === "finished" &&
			previousStatusRef.current &&
			previousStatusRef.current !== "finished" &&
			!showFinalResults
		) {
			setFinalCountdown(5);
			const interval = setInterval(() => {
				setFinalCountdown((prev) => {
					if (prev === null || prev <= 1) {
						clearInterval(interval);
						setShowFinalResults(true);
						return null;
					}
					return prev - 1;
				});
			}, 1000);
		}

		// If page loaded with finished status, show results immediately
		if (
			currentStatus === "finished" &&
			previousStatusRef.current === null &&
			!showFinalResults
		) {
			setShowFinalResults(true);
		}

		previousStatusRef.current = currentStatus || null;
	}, [gameStatus?.game.status, showFinalResults]);

	const handleStartGame = async () => {
		if (!adminToken || !gameStatus) return;
		setActionLoading(true);

		try {
			const response = await fetch("/api/game/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ gameId: gameStatus.game.id, adminToken }),
			});
			const data = await response.json();

			if (!data.success) {
				setError(data.error);
			} else {
				// Notify all clients that the game has started
				notifyGameStarted();
				fetchStatus();
			}
		} catch {
			setError("Échec du démarrage");
		} finally {
			setActionLoading(false);
		}
	};

	if (loading) {
		return <div className="loading">Chargement...</div>;
	}

	if (!gameStatus) {
		return <div className="error-page">Partie introuvable</div>;
	}

	const joinUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/game/${code}/join`
			: "";

	const playersReady = gameStatus.players.filter(
		(p) => p.hasSubmittedStatements,
	).length;
	const totalPlayers = gameStatus.players.length;

	return (
		<div className="admin-container">
			<div className="admin-header">
				<h1>Partie : {code}</h1>
				<span className={`status-badge status-${gameStatus.game.status}`}>
					{gameStatus.game.status.replace("-", " ")}
				</span>
			</div>

			{error && <p className="error">{error}</p>}

			{gameStatus.game.status === "lobby" && (
				<div className="lobby-section">
					<div className="qr-section">
						<h2>Partagez ce code pour rejoindre :</h2>
						<div className="code-display">{code}</div>
						{joinUrl && (
							<div className="qr-code">
								<QRCodeSVG value={joinUrl} size={200} />
							</div>
						)}
						<p className="join-url">{joinUrl}</p>
					</div>

					<div className="players-section">
						<h3>Joueurs ({totalPlayers})</h3>
						<div className="players-list">
							{gameStatus.players.map((player) => (
								<div key={player.id} className="player-card">
									<PlayerAvatar
										avatarUrl={player.avatarUrl}
										nickname={player.nickname}
										size="medium"
									/>
									<span className="player-name">{player.nickname}</span>
									<span
										className={`player-status ${player.hasSubmittedStatements ? "ready" : "waiting"}`}
									>
										{player.hasSubmittedStatements ? "✅ Prêt" : "⏳ Écrit..."}
									</span>
								</div>
							))}
							{gameStatus.players.length === 0 && (
								<p className="no-players">En attente de joueurs...</p>
							)}
						</div>
					</div>

					<div className="start-section">
						<p>
							{playersReady} sur {totalPlayers} joueurs prêts
						</p>
						<button
							type="button"
							onClick={handleStartGame}
							disabled={playersReady < 2 || actionLoading}
							className="btn btn-primary btn-large"
						>
							{actionLoading ? "Démarrage..." : "Démarrer la partie"}
						</button>
						{playersReady < 2 && (
							<p className="hint">
								Il faut au moins 2 joueurs prêts pour commencer
							</p>
						)}
					</div>
				</div>
			)}

			{gameStatus.game.status !== "lobby" &&
				gameStatus.game.status !== "finished" && (
					<div className="game-section">
						{/* Voting Author Phase */}
						{gameStatus.game.status === "voting-author" && (
							<>
								<div className="round-info">
									<h2>
										Phase Auteur - Joueur {gameStatus.game.currentRound} /{" "}
										{gameStatus.game.totalPlayers}
									</h2>
									<p className="phase-description">
										Les joueurs devinent qui a écrit ces affirmations
									</p>
								</div>

								{gameStatus.currentRound?.statements && (
									<div className="statements-display">
										<h3>Affirmations :</h3>
										{gameStatus.currentRound.statements.map(
											(statement, index) => (
												<div key={statement.id} className="statement-card">
													<span className="statement-number">{index + 1}</span>
													<span className="statement-text">
														{statement.text}
													</span>
												</div>
											),
										)}
									</div>
								)}

								<div className="voting-progress">
									<p>
										Votes: {gameStatus.currentRound?.votesReceived} /{" "}
										{gameStatus.currentRound?.votesNeeded}
									</p>
									<div className="progress-bar">
										<div
											className="progress-fill"
											style={{
												width: `${((gameStatus.currentRound?.votesReceived || 0) / (gameStatus.currentRound?.votesNeeded || 1)) * 100}%`,
											}}
										/>
									</div>
									{gameStatus.currentRound?.voterStatus && (
										<div className="voter-status-list">
											{gameStatus.currentRound.voterStatus.map((voter) => (
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
							</>
						)}

						{/* Results Author Phase - Show ALL results */}
						{gameStatus.game.status === "results-author" &&
							gameStatus.allAuthorResults && (
								<>
									<div className="round-info">
										<h2>Résultats - Auteurs</h2>
										<p className="phase-description">
											Voici qui a écrit chaque série d'affirmations
										</p>
									</div>

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
															<span className="statement-number">
																{index + 1}
															</span>
															<span className="statement-text">
																{statement.text}
															</span>
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
																<span>{vote.isCorrect ? "✅" : "❌"}</span>
															</div>
														))}
													</div>
												)}
											</div>
										))}
									</div>
								</>
							)}

						{/* Voting Truth Phase */}
						{gameStatus.game.status === "voting-truth" && (
							<>
								<div className="round-info">
									<h2>
										Phase Vérité - Joueur {gameStatus.game.truthRound} /{" "}
										{gameStatus.game.totalPlayers}
									</h2>
									{gameStatus.currentRound && (
										<p className="current-player-info">
											Joueur actuel :{" "}
											<span className="author-name">
												<PlayerAvatar
													avatarUrl={gameStatus.currentRound.playerAvatarUrl}
													nickname={gameStatus.currentRound.playerNickname}
													size="medium"
												/>
												<strong>
													{gameStatus.currentRound.playerNickname}
												</strong>
											</span>
										</p>
									)}
								</div>

								{gameStatus.currentRound?.statements && (
									<div className="statements-display">
										<h3>Quelle affirmation est VRAIE ?</h3>
										{gameStatus.currentRound.statements.map(
											(statement, index) => (
												<div key={statement.id} className="statement-card">
													<span className="statement-number">{index + 1}</span>
													<span className="statement-text">
														{statement.text}
													</span>
												</div>
											),
										)}
									</div>
								)}

								<div className="voting-progress">
									<p>
										Votes: {gameStatus.currentRound?.votesReceived} /{" "}
										{gameStatus.currentRound?.votesNeeded}
									</p>
									<div className="progress-bar">
										<div
											className="progress-fill"
											style={{
												width: `${((gameStatus.currentRound?.votesReceived || 0) / (gameStatus.currentRound?.votesNeeded || 1)) * 100}%`,
											}}
										/>
									</div>
									{gameStatus.currentRound?.voterStatus && (
										<div className="voter-status-list">
											{gameStatus.currentRound.voterStatus.map((voter) => (
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
							</>
						)}

						{/* Results Truth Phase */}
						{gameStatus.game.status === "results-truth" && (
							<>
								<div className="round-info">
									<h2>
										Résultat Vérité - Joueur {gameStatus.game.truthRound} /{" "}
										{gameStatus.game.totalPlayers}
									</h2>
									{gameStatus.currentRound && (
										<p className="current-player-info">
											Joueur :{" "}
											<span className="author-name">
												<PlayerAvatar
													avatarUrl={gameStatus.currentRound.playerAvatarUrl}
													nickname={gameStatus.currentRound.playerNickname}
													size="medium"
												/>
												<strong>
													{gameStatus.currentRound.playerNickname}
												</strong>
											</span>
										</p>
									)}
								</div>

								{gameStatus.currentRound?.statements && (
									<div className="statements-display">
										{gameStatus.currentRound.statements.map(
											(statement, index) => (
												<div
													key={statement.id}
													className={`statement-card ${statement.isTrue !== undefined ? (statement.isTrue ? "true" : "false") : ""}`}
												>
													<span className="statement-number">{index + 1}</span>
													<span className="statement-text">
														{statement.text}
													</span>
													{statement.isTrue !== undefined && (
														<span className="statement-truth">
															{statement.isTrue ? "✅ VRAI" : "❌ FAUX"}
														</span>
													)}
												</div>
											),
										)}
									</div>
								)}

								{gameStatus.currentRound?.voteResults && (
									<div className="vote-results">
										<h3>Résultats des votes :</h3>
										{gameStatus.currentRound.voteResults.map((result) => (
											<div
												key={`${result.voter}-${result.votedStatement}`}
												className={`vote-result ${result.isCorrect ? "correct" : "incorrect"}`}
											>
												<span>{result.voter}</span>
												<span>
													{result.isCorrect ? "✅ Correct !" : "❌ Faux"}
												</span>
											</div>
										))}
									</div>
								)}
							</>
						)}

						<div className="scoreboard">
							<h3>Classement</h3>
							{gameStatus.players
								.sort((a, b) => b.score - a.score)
								.map((player, index) => (
									<div key={player.id} className="score-row">
										<span className="rank">#{index + 1}</span>
										<span className="player-name">
											<PlayerAvatar
												avatarUrl={player.avatarUrl}
												nickname={player.nickname}
												size="small"
											/>
											{player.nickname}
										</span>
										<span className="score">{player.score} pts</span>
									</div>
								))}
						</div>
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

			{gameStatus.game.status === "finished" &&
				showFinalResults &&
				(() => {
					const sortedPlayers = [...gameStatus.players].sort(
						(a, b) => b.score - a.score,
					);
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
											className={`final-score-row ${isWinner ? "winner" : ""}`}
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
												{player.nickname}
											</span>
											<span className="score">{player.score} pts</span>
										</div>
									);
								})}
							</div>
							<button
								type="button"
								onClick={() => router.push("/")}
								className="btn btn-secondary"
							>
								Retour à l&apos;accueil
							</button>
						</div>
					);
				})()}
		</div>
	);
}
