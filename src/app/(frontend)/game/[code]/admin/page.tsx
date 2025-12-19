"use client";

import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";

interface Player {
	id: string;
	nickname: string;
	score: number;
	hasSubmittedStatements: boolean;
}

interface GameStatus {
	game: {
		id: string;
		code: string;
		status: string;
		currentRound: number;
	};
	players: Player[];
	currentRound?: {
		playerNickname: string;
		playerId: string;
		statements: { id: string; text: string; order: number; isTrue?: boolean }[];
		voteResults?: {
			voter: string;
			votedPlayer?: string;
			votedStatement?: string;
			isCorrect: boolean;
		}[];
		votesReceived: number;
		votesNeeded: number;
	};
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

	useEffect(() => {
		const token = localStorage.getItem(`game_${code}_admin`);
		if (!token) {
			router.push(`/game/${code}/join`);
			return;
		}
		setAdminToken(token);
		fetchStatus();

		// Poll for updates
		const interval = setInterval(fetchStatus, 5000);
		return () => clearInterval(interval);
	}, [code, router, fetchStatus]);

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
			}
		} catch {
			setError("Échec du démarrage");
		} finally {
			setActionLoading(false);
		}
	};

	const handleNextPhase = async () => {
		if (!adminToken || !gameStatus) return;
		setActionLoading(true);

		try {
			const response = await fetch("/api/game/next-phase", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ gameId: gameStatus.game.id, adminToken }),
			});
			const data = await response.json();

			if (!data.success) {
				setError(data.error);
			}
		} catch {
			setError("Échec de la progression");
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
						<div className="round-info">
							<h2>Manche {gameStatus.game.currentRound}</h2>
							{gameStatus.currentRound && gameStatus.game.status !== "voting-author" && (
								<p>
									Joueur actuel :{" "}
									<strong>{gameStatus.currentRound.playerNickname}</strong>
								</p>
							)}
						</div>

						{gameStatus.currentRound?.statements && (
							<div className="statements-display">
								<h3>Affirmations :</h3>
								{gameStatus.currentRound.statements.map((statement, index) => (
									<div
										key={statement.id}
										className={`statement-card ${gameStatus.game.status === "results-truth" && statement.isTrue !== undefined ? (statement.isTrue ? "true" : "false") : ""}`}
									>
										<span className="statement-number">{index + 1}</span>
										<span className="statement-text">{statement.text}</span>
										{gameStatus.game.status === "results-truth" && statement.isTrue !== undefined && (
											<span className="statement-truth">
												{statement.isTrue ? "✅ VRAI" : "❌ FAUX"}
											</span>
										)}
									</div>
								))}
							</div>
						)}

						{(gameStatus.game.status === "voting-author" ||
							gameStatus.game.status === "voting-truth") && (
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
							</div>
						)}

						{gameStatus.currentRound?.voteResults && (
							<div className="vote-results">
								<h3>Résultats des votes :</h3>
								{gameStatus.currentRound.voteResults.map((result) => (
									<div
										key={`${result.voter}-${result.votedPlayer || result.votedStatement}`}
										className={`vote-result ${result.isCorrect ? "correct" : "incorrect"}`}
									>
										<span>{result.voter}</span>
										<span>{result.isCorrect ? "✅" : "❌"}</span>
									</div>
								))}
							</div>
						)}

						<div className="admin-controls">
							<button
								type="button"
								className="btn btn-primary"
								onClick={handleNextPhase}
							>
								{actionLoading ? "Chargement..." : "Phase suivante →"}
							</button>
						</div>

						<div className="scoreboard">
							<h3>Classement</h3>
							{gameStatus.players
								.sort((a, b) => b.score - a.score)
								.map((player, index) => (
									<div key={player.id} className="score-row">
										<span className="rank">#{index + 1}</span>
										<span className="player-name">{player.nickname}</span>
										<span className="score">{player.score} pts</span>
									</div>
								))}
						</div>
					</div>
				)}

			{gameStatus.game.status === "finished" && (
				<div className="finished-section">
					<h2>🎉 Partie terminée !</h2>
					<div className="final-scoreboard">
						{gameStatus.players
							.sort((a, b) => b.score - a.score)
							.map((player, index) => (
								<div
									key={player.id}
									className={`final-score-row ${index === 0 ? "winner" : ""}`}
								>
									<span className="rank">
										{index === 0
											? "🏆"
											: index === 1
												? "🥈"
												: index === 2
													? "🥉"
													: `#${index + 1}`}
									</span>
									<span className="player-name">{player.nickname}</span>
									<span className="score">{player.score} pts</span>
								</div>
							))}
					</div>
					<button
						type="button"
						onClick={() => router.push("/")}
						className="btn btn-secondary"
					>
						Retour à l&apos;accueil
					</button>
				</div>
			)}
		</div>
	);
}
