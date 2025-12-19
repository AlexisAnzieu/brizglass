"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
	const router = useRouter();
	const [joinCode, setJoinCode] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState("");

	const handleCreateGame = async () => {
		setIsCreating(true);
		setError("");

		try {
			const response = await fetch("/api/game/create", { method: "POST" });
			const data = await response.json();

			if (data.success) {
				// Store admin token in localStorage
				localStorage.setItem(
					`game_${data.game.code}_admin`,
					data.game.adminToken,
				);
				router.push(`/game/${data.game.code}/admin`);
			} else {
				setError(data.error || "Échec de la création de la partie");
			}
		} catch {
			setError("Échec de la création de la partie");
		} finally {
			setIsCreating(false);
		}
	};

	const handleJoinGame = (e: React.FormEvent) => {
		e.preventDefault();
		if (joinCode.trim()) {
			router.push(`/game/${joinCode.toUpperCase()}/join`);
		}
	};

	return (
		<div className="home-container">
			<div className="hero">
				<h1>🧊 Brizglass</h1>
				<p>
					Apprenez à vous connaître grâce à des jeux de devinettes amusants !
				</p>
			</div>

			<div className="actions">
				<div className="action-card">
					<h2>Créer une partie</h2>
					<p>Lancez une nouvelle session et invitez d&apos;autres joueurs</p>
					<button
						type="button"
						onClick={handleCreateGame}
						disabled={isCreating}
						className="btn btn-primary"
					>
						{isCreating ? "Création..." : "Créer une partie"}
					</button>
				</div>

				<div className="divider">ou</div>

				<div className="action-card">
					<h2>Rejoindre une partie</h2>
					<p>Entrez le code de la partie pour rejoindre</p>
					<form onSubmit={handleJoinGame} className="join-form">
						<input
							type="text"
							value={joinCode}
							onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
							placeholder="Code (ex: ABC123)"
							maxLength={6}
							className="input"
						/>
						<button
							type="submit"
							className="btn btn-secondary"
							disabled={!joinCode.trim()}
						>
							Rejoindre
						</button>
					</form>
				</div>
			</div>

			{error && <p className="error">{error}</p>}

			<div className="how-it-works">
				<h3>Comment ça marche</h3>
				<ol>
					<li>🎮 Créez une partie ou rejoignez avec un code</li>
					<li>✍️ Écrivez 3 affirmations sur vous (2 mensonges, 1 vérité)</li>
					<li>🤔 Devinez qui a écrit quelles affirmations</li>
					<li>🎯 Identifiez quelle affirmation est vraie</li>
					<li>🏆 Marquez des points et amusez-vous !</li>
				</ol>
			</div>
		</div>
	);
}
