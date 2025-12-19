"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function JoinPage() {
	const router = useRouter();
	const params = useParams();
	const code = params.code as string;

	const [nickname, setNickname] = useState("");
	const [avatar, setAvatar] = useState<File | null>(null);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [checkingSession, setCheckingSession] = useState(true);
	const [error, setError] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			// Validate file size (max 5MB)
			if (file.size > 5 * 1024 * 1024) {
				setError("L'image doit faire moins de 5MB");
				return;
			}
			setAvatar(file);
			setAvatarPreview(URL.createObjectURL(file));
			setError("");
		}
	};

	const handleRemoveAvatar = () => {
		setAvatar(null);
		if (avatarPreview) {
			URL.revokeObjectURL(avatarPreview);
		}
		setAvatarPreview(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

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
			const formData = new FormData();
			formData.append("code", code);
			formData.append("nickname", nickname.trim());
			if (avatar) {
				formData.append("avatar", avatar);
			}

			const response = await fetch("/api/game/join", {
				method: "POST",
				body: formData,
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
				<div className="avatar-upload">
					<label htmlFor="avatar" className="avatar-label">
						{avatarPreview ? (
							<div className="avatar-preview-container">
								<img
									src={avatarPreview}
									alt="Aperçu"
									className="avatar-preview"
								/>
								<button
									type="button"
									onClick={(e) => {
										e.preventDefault();
										handleRemoveAvatar();
									}}
									className="avatar-remove"
								>
									×
								</button>
							</div>
						) : (
							<div className="avatar-placeholder">
								<span className="avatar-icon">📷</span>
								<span className="avatar-text">Ajouter une photo</span>
							</div>
						)}
					</label>
					<input
						ref={fileInputRef}
						id="avatar"
						type="file"
						accept="image/*"
						onChange={handleAvatarChange}
						className="avatar-input"
					/>
				</div>

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
