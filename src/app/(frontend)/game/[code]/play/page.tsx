"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
}

interface CurrentPlayer {
	id: string;
	nickname: string;
	hasSubmittedStatements: boolean;
	hasVotedAuthor: boolean;
	hasVotedTruth: boolean;
	isCurrentRoundPlayer: boolean;
}

interface GameStatus {
	game: {
		id: string;
		code: string;
		status: string;
		currentRound: number;
	};
	players: Player[];
	currentPlayer: CurrentPlayer | null;
	currentRound?: {
		playerNickname: string;
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
	};
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

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 5000);
		return () => clearInterval(interval);
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
								<span>{player.nickname}</span>
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

			{/* Results - Author */}
			{game.status === "results-author" && currentRound && (
				<div className="results-section">
					<h2>Résultats - Auteur</h2>
					<p>
						Les affirmations ont été écrites par :{" "}
						<strong>{currentRound.playerNickname}</strong>
					</p>

					{currentRound.voteResults && (
						<div className="vote-results">
							{currentRound.voteResults.map((result) => (
								<div
									key={`${result.voter}-${result.votedPlayer}`}
									className={`vote-result ${result.isCorrect ? "correct" : "incorrect"}`}
								>
									<span>{result.voter}</span>
									<span>a deviné {result.votedPlayer}</span>
									<span>{result.isCorrect ? "✅ +1" : "❌"}</span>
								</div>
							))}
						</div>
					)}

					<p className="hint">En attente de l&apos;admin pour continuer...</p>
				</div>
			)}

			{/* Voting on Truth */}
			{game.status === "voting-truth" && currentRound && (
				<div className="voting-section">
					<h2>Quelle affirmation est VRAIE ?</h2>
					<p>
						Écrit par : <strong>{currentRound.playerNickname}</strong>
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
						</div>
					) : currentPlayer.hasVotedTruth ? (
						<div className="voted">
							<p>✅ Vote envoyé ! En attente des autres...</p>
							<p>
								Votes : {currentRound.votesReceived} /{" "}
								{currentRound.votesNeeded}
							</p>
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

					<p className="hint">En attente de l&apos;admin pour continuer...</p>
				</div>
			)}

			{/* Game Finished */}
			{game.status === "finished" && (
				<div className="finished-section">
					<h2>🎉 Partie terminée !</h2>

					<div className="final-scoreboard">
						{players
							.sort((a, b) => b.score - a.score)
							.map((player, index) => (
								<div
									key={player.id}
									className={`final-score-row ${index === 0 ? "winner" : ""} ${player.id === currentPlayer.id ? "you" : ""}`}
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
									<span className="player-name">
										{player.nickname}{" "}
										{player.id === currentPlayer.id && "(Vous)"}
									</span>
									<span className="score">{player.score} pts</span>
								</div>
							))}
					</div>

					<button
						type="button"
						onClick={() => router.push("/")}
						className="btn btn-primary"
					>
						Rejouer
					</button>
				</div>
			)}

			{/* Scoreboard (always visible during active game) */}
			{!["lobby", "finished"].includes(game.status) && (
				<div className="mini-scoreboard">
					<h4>Scores</h4>
					{players
						.sort((a, b) => b.score - a.score)
						.slice(0, 5)
						.map((player) => (
							<div key={player.id} className="mini-score-row">
								<span>{player.nickname}</span>
								<span>{player.score}</span>
							</div>
						))}
				</div>
			)}
		</div>
	);
}
