import type * as Party from "partykit/server";

// Message types for real-time game updates
export type GameMessage =
	| { type: "game-update"; gameCode: string }
	| { type: "player-joined"; gameCode: string; playerNickname: string }
	| { type: "player-ready"; gameCode: string; playerId: string }
	| { type: "game-started"; gameCode: string }
	| { type: "vote-submitted"; gameCode: string }
	| { type: "phase-changed"; gameCode: string; newPhase: string }
	| { type: "ping" }
	| { type: "pong" };

export default class GameParty implements Party.Server {
	constructor(readonly room: Party.Room) {}

	onConnect(conn: Party.Connection) {
		// Send a welcome message to the new connection
		conn.send(JSON.stringify({ type: "connected", roomId: this.room.id }));
	}

	onMessage(message: string, sender: Party.Connection) {
		try {
			const data = JSON.parse(message) as GameMessage;

			// Handle ping/pong for connection health
			if (data.type === "ping") {
				sender.send(JSON.stringify({ type: "pong" }));
				return;
			}

			// Broadcast the message to all connections in the room (including sender)
			this.room.broadcast(message);
		} catch (error) {
			console.error("Error processing message:", error);
		}
	}

	onClose(conn: Party.Connection) {
		// Connection closed - could notify others if needed
	}
}
