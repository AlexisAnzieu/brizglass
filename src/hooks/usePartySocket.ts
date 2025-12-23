"use client";

import PartySocket from "partysocket";
import { useCallback, useEffect, useRef } from "react";
import type { GameMessage } from "../../party/index";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

interface UsePartySocketOptions {
	gameCode: string;
	onGameUpdate?: () => void;
	onPlayerJoined?: (playerNickname: string) => void;
	onPlayerReady?: (playerId: string) => void;
	onGameStarted?: () => void;
	onVoteSubmitted?: () => void;
	onPhaseChanged?: (newPhase: string) => void;
}

export function usePartySocket({
	gameCode,
	onGameUpdate,
	onPlayerJoined,
	onPlayerReady,
	onGameStarted,
	onVoteSubmitted,
	onPhaseChanged,
}: UsePartySocketOptions) {
	const socketRef = useRef<PartySocket | null>(null);

	// Broadcast a message to all clients in the game room
	const broadcast = useCallback((message: GameMessage) => {
		if (socketRef.current?.readyState === WebSocket.OPEN) {
			socketRef.current.send(JSON.stringify(message));
		}
	}, []);

	// Convenience methods for common events
	const notifyGameUpdate = useCallback(() => {
		broadcast({ type: "game-update", gameCode });
	}, [broadcast, gameCode]);

	const notifyPlayerJoined = useCallback(
		(playerNickname: string) => {
			broadcast({ type: "player-joined", gameCode, playerNickname });
		},
		[broadcast, gameCode],
	);

	const notifyPlayerReady = useCallback(
		(playerId: string) => {
			broadcast({ type: "player-ready", gameCode, playerId });
		},
		[broadcast, gameCode],
	);

	const notifyGameStarted = useCallback(() => {
		broadcast({ type: "game-started", gameCode });
	}, [broadcast, gameCode]);

	const notifyVoteSubmitted = useCallback(() => {
		broadcast({ type: "vote-submitted", gameCode });
	}, [broadcast, gameCode]);

	const notifyPhaseChanged = useCallback(
		(newPhase: string) => {
			broadcast({ type: "phase-changed", gameCode, newPhase });
		},
		[broadcast, gameCode],
	);

	useEffect(() => {
		if (!gameCode) return;

		const socket = new PartySocket({
			host: PARTYKIT_HOST,
			room: gameCode.toUpperCase(),
		});

		socketRef.current = socket;

		socket.addEventListener("message", (event) => {
			try {
				const data = JSON.parse(event.data) as
					| GameMessage
					| { type: "connected"; roomId: string };

				switch (data.type) {
					case "connected":
						console.log(`Connected to game room: ${data.roomId}`);
						break;
					case "game-update":
						onGameUpdate?.();
						break;
					case "player-joined":
						onPlayerJoined?.(data.playerNickname);
						break;
					case "player-ready":
						onPlayerReady?.(data.playerId);
						break;
					case "game-started":
						onGameStarted?.();
						break;
					case "vote-submitted":
						onVoteSubmitted?.();
						break;
					case "phase-changed":
						onPhaseChanged?.(data.newPhase);
						break;
				}
			} catch (error) {
				console.error("Error parsing message:", error);
			}
		});

		socket.addEventListener("error", (error) => {
			console.error("PartySocket error:", error);
		});

		return () => {
			socket.close();
			socketRef.current = null;
		};
	}, [
		gameCode,
		onGameUpdate,
		onPlayerJoined,
		onPlayerReady,
		onGameStarted,
		onVoteSubmitted,
		onPhaseChanged,
	]);

	return {
		broadcast,
		notifyGameUpdate,
		notifyPlayerJoined,
		notifyPlayerReady,
		notifyGameStarted,
		notifyVoteSubmitted,
		notifyPhaseChanged,
	};
}
