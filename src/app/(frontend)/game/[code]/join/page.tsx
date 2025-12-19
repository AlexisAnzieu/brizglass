"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function JoinPage() {
	const router = useRouter();
	const params = useParams();
	const code = params.code as string;

	const [nickname, setNickname] = useState("");
	const [loading, setLoading] = useState(false);
	const [checkingSession, setCheckingSession] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		// Check if player already has a session for this game
		const checkSession = async () => {
			try {
				const response = await fetch(`/api/game/${code}/status`);
				const data = await response.json();

				if (data.currentPlayer) {
					// Player already in the game, redirect to play page
					router.push(`/game/${code}/play`);
					return;
				}

				if (data.error) {
					setError(data.error);
				}
			} catch {
				// No session, continue to join form
			} finally {
				setCheckingSession(false);
			}
		};

		checkSession();
	}, [code, router]);

	const handleJoin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!nickname.trim()) return;

		setLoading(true);
		setError("");

		try {
			const response = await fetch("/api/game/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, nickname: nickname.trim() }),
			});

			const data = await response.json();

			if (data.success) {
				router.push(`/game/${code}/play`);
			} else {
				setError(data.error || "Échec de la connexion");
			}
		} catch {
			setError("Échec de la connexion");
		} finally {
			setLoading(false);
		}
	};

	if (checkingSession) {
		return <div className="loading">Chargement...</div>;
	}

	return (
		<div className="join-container">
			<h1>Rejoindre la partie</h1>
			<div className="code-display">{code}</div>

			{error && <p className="error">{error}</p>}

			<form onSubmit={handleJoin} className="join-form">
				<label htmlFor="nickname">Votre pseudo</label>
				<input
					id="nickname"
					type="text"
					value={nickname}
					onChange={(e) => setNickname(e.target.value)}
					placeholder="Entrez votre nom"
					maxLength={20}
					minLength={2}
					required
					className="input"
				/>
				<button
					type="submit"
					disabled={loading || !nickname.trim()}
					className="btn btn-primary"
				>
					{loading ? "Connexion..." : "Rejoindre"}
				</button>
			</form>
		</div>
	);
}
