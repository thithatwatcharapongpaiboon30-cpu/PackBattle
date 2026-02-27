import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const PORT = 3000;

  // Game State Management
  const rooms = new Map<string, any>();

  wss.on("connection", (ws: WebSocket) => {
    let connectionPlayerId: string | null = null;
    let connectionRoomId: string | null = null;
    let isAlive = true;

    ws.on("pong", () => { isAlive = true; });

    const pingInterval = setInterval(() => {
      if (!isAlive) return ws.terminate();
      isAlive = false;
      ws.ping();
    }, 30000);

    ws.on("message", (rawData: any) => {
      try {
        const message = JSON.parse(rawData.toString());
        const { type, payload } = message;

        switch (type) {
          case "JOIN_ROOM": {
            const { roomId, playerName, playerId: existingId } = payload;
            const cleanRoomId = roomId?.trim().toUpperCase();
            const cleanPlayerName = playerName?.trim();

            if (!cleanRoomId || !cleanPlayerName) {
              ws.send(JSON.stringify({ type: "ERROR", payload: "Name and Room ID are required" }));
              return;
            }

            if (!rooms.has(cleanRoomId)) {
              rooms.set(cleanRoomId, {
                id: cleanRoomId,
                players: [],
                status: "LOBBY",
                round: 0,
                maxRounds: 0,
                currentWheels: null,
                history: [],
              });
            }

            const room = rooms.get(cleanRoomId);
            
            // Rejoin logic: check if player already exists by ID or Name
            let player = room.players.find((p: any) => (existingId && p.id === existingId) || p.name === cleanPlayerName);

            if (player) {
              // Update existing player's socket
              player.ws = ws;
              connectionPlayerId = player.id;
              console.log(`[Room] ${cleanPlayerName} rejoined ${cleanRoomId}`);
            } else {
              if (room.players.length >= 6) {
                ws.send(JSON.stringify({ type: "ERROR", payload: "Room is full" }));
                return;
              }
              if (room.status !== "LOBBY") {
                ws.send(JSON.stringify({ type: "ERROR", payload: "Game already started" }));
                return;
              }

              const newId = existingId || Math.random().toString(36).substr(2, 9);
              player = {
                id: newId,
                name: cleanPlayerName,
                ws,
                points: 0,
                money: 0,
                collection: [],
                selectedPokemon: null,
                hasSkipped: false,
                isHost: room.players.length === 0,
              };
              room.players.push(player);
              connectionPlayerId = newId;
              console.log(`[Room] ${cleanPlayerName} joined ${cleanRoomId}`);
            }

            connectionRoomId = cleanRoomId;
            
            ws.send(JSON.stringify({
              type: "JOINED",
              payload: { playerId: player.id, room: getSanitizedRoom(room) }
            }));

            broadcast(cleanRoomId, {
              type: "ROOM_UPDATED",
              payload: getSanitizedRoom(room),
            });
            break;
          }

          case "START_GAME": {
            const room = rooms.get(connectionRoomId || "");
            const player = room?.players.find((p: any) => p.id === connectionPlayerId);
            if (player?.isHost && room.status === "LOBBY" && room.players.length >= 2) {
              room.status = "PLAYING";
              room.maxRounds = room.players.length * 3;
              room.round = 1;
              startRound(room);
              broadcast(connectionRoomId!, { type: "ROOM_UPDATED", payload: getSanitizedRoom(room) });
            }
            break;
          }

          case "DELETE_ROOM": {
            const room = rooms.get(connectionRoomId || "");
            const player = room?.players.find((p: any) => p.id === connectionPlayerId);
            if (player?.isHost) {
              broadcast(connectionRoomId!, { type: "ROOM_DELETED" });
              rooms.delete(connectionRoomId!);
            }
            break;
          }

          case "BUY_PACK": {
            const room = rooms.get(connectionRoomId || "");
            const player = room?.players.find((p: any) => p.id === connectionPlayerId);
            if (player && player.money >= payload.cost) {
              player.money -= payload.cost;
              player.collection.push(...payload.pokemon);
              broadcast(connectionRoomId!, { type: "ROOM_UPDATED", payload: getSanitizedRoom(room) });
            }
            break;
          }

          case "SELECT_POKEMON": {
            const room = rooms.get(connectionRoomId || "");
            const player = room?.players.find((p: any) => p.id === connectionPlayerId);
            if (player) {
              player.selectedPokemon = payload.pokemon;
              player.hasSkipped = payload.skipped || false;
              checkRoundEnd(room);
              broadcast(connectionRoomId!, { type: "ROOM_UPDATED", payload: getSanitizedRoom(room) });
            }
            break;
          }

          case "SYNC": {
            const room = rooms.get(connectionRoomId || "");
            if (room) {
              ws.send(JSON.stringify({ type: "ROOM_UPDATED", payload: getSanitizedRoom(room) }));
            }
            break;
          }
        }
      } catch (err) {
        console.error("[WS] Error:", err);
      }
    });

    ws.on("close", () => {
      clearInterval(pingInterval);
      if (connectionRoomId && connectionPlayerId) {
        const room = rooms.get(connectionRoomId);
        if (room) {
          // We don't immediately remove the player to allow for rejoin
          // But we should notify others that they are "offline" if we had that state
          // For now, let's keep them in the list so the game doesn't break
          console.log(`[WS] Player ${connectionPlayerId} disconnected from ${connectionRoomId}`);
        }
      }
    });
  });

  function broadcast(roomId: string, message: any) {
    const room = rooms.get(roomId);
    if (!room) return;
    const data = JSON.stringify(message);
    room.players.forEach((p: any) => {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(data);
      }
    });
  }

  function getSanitizedRoom(room: any) {
    if (!room) return null;
    const sanitized = {
      id: room.id,
      status: room.status,
      round: room.round,
      maxRounds: room.maxRounds,
      currentWheels: room.currentWheels,
      players: room.players.map((p: any) => ({
        id: p.id,
        name: p.name,
        points: p.points,
        money: p.money,
        collection: p.collection,
        hasSelected: !!p.selectedPokemon || p.hasSkipped,
        hasSkipped: p.hasSkipped,
        isHost: p.isHost,
      })),
    };
    return sanitized;
  }

  function startRound(room: any) {
    console.log(`[Room] Starting round ${room.round} in ${room.id}`);
    // Reset player states for new round
    room.players.forEach((p: any) => {
      p.money += 10;
      p.selectedPokemon = null;
      p.hasSkipped = false;
    });

    const statOptions = [
      "highest base stat", "highest attack", "highest special attack", "highest hp", 
      "highest defense", "highest special defense", "highest speed",
      "lowest base stat", "lowest attack", "lowest special attack", "lowest hp", 
      "lowest defense", "lowest special defense", "lowest speed"
    ];
    const twistOptions = [
      "comes from 3 stage line", "comes from 2 stage line", "comes from one stage line", 
      "cannot evolve", "can evolve"
    ];

    room.currentWheels = {
      stat: statOptions[Math.floor(Math.random() * statOptions.length)],
      twist: twistOptions[Math.floor(Math.random() * twistOptions.length)],
    };

    broadcast(room.id, {
      type: "ROUND_STARTED",
      payload: {
        round: room.round,
        wheels: room.currentWheels,
        room: getSanitizedRoom(room),
      },
    });
  }

  function checkRoundEnd(room: any) {
    const allReady = room.players.every((p: any) => p.selectedPokemon || p.hasSkipped);
    if (allReady) {
      console.log(`[Room] All players ready in ${room.id}. Resolving round...`);
      resolveRound(room);
    }
  }

  function resolveRound(room: any) {
    const playersWhoPlayed = room.players.filter((p: any) => p.selectedPokemon && !p.hasSkipped);
    
    let winners: any[] = [];

    if (playersWhoPlayed.length === 0) {
      // Rule 4: All get 1 point
      console.log("[Room] No players played. All get 1 point.");
      room.players.forEach((p: any) => p.points += 1);
      winners = room.players;
    } else if (playersWhoPlayed.length === 1) {
      // Rule 3: Single player wins
      console.log(`[Room] Only ${playersWhoPlayed[0].name} played. Automatic win.`);
      playersWhoPlayed[0].points += 1;
      winners = [playersWhoPlayed[0]];
    } else {
      // Rule 1 & 2: Compare stats and twist compliance
      const compliantPlayers = playersWhoPlayed.filter((p: any) => isCompliant(p.selectedPokemon, room.currentWheels.twist));
      
      if (compliantPlayers.length === 0) {
        console.log("[Room] No compliant players. No winners.");
      } else if (compliantPlayers.length === 1) {
        console.log(`[Room] Only ${compliantPlayers[0].name} was compliant. Win.`);
        compliantPlayers[0].points += 1;
        winners = [compliantPlayers[0]];
      } else {
        const statKey = getStatKey(room.currentWheels.stat);
        const isHighest = room.currentWheels.stat.startsWith("highest");
        
        let bestValue = isHighest ? -Infinity : Infinity;
        let roundWinners: any[] = [];

        compliantPlayers.forEach((p: any) => {
          const val = getPokemonStat(p.selectedPokemon, statKey);
          if (isHighest) {
            if (val > bestValue) {
              bestValue = val;
              roundWinners = [p];
            } else if (val === bestValue) {
              roundWinners.push(p);
            }
          } else {
            if (val < bestValue) {
              bestValue = val;
              roundWinners = [p];
            } else if (val === bestValue) {
              roundWinners.push(p);
            }
          }
        });

        console.log(`[Room] Round winners: ${roundWinners.map(p => p.name).join(", ")}`);
        roundWinners.forEach(p => p.points += 1);
        winners = roundWinners;
      }
    }

    broadcast(room.id, {
      type: "ROUND_RESOLVED",
      payload: {
        winners: winners.map(p => p.id),
        room: getSanitizedRoom(room),
      },
    });

    setTimeout(() => {
      if (room.round < room.maxRounds) {
        room.round += 1;
        startRound(room);
      } else {
        room.status = "FINISHED";
        console.log(`[Room] Game finished in ${room.id}`);
        broadcast(room.id, {
          type: "GAME_FINISHED",
          payload: getSanitizedRoom(room),
        });
      }
    }, 5000);
  }

  function isCompliant(pokemon: any, twist: string) {
    if (!pokemon) return false;
    // These values should be attached to the pokemon object when fetched
    switch (twist) {
      case "comes from 3 stage line": return pokemon.evolutionLineLength === 3;
      case "comes from 2 stage line": return pokemon.evolutionLineLength === 2;
      case "comes from one stage line": return pokemon.evolutionLineLength === 1;
      case "cannot evolve": return !pokemon.canEvolve;
      case "can evolve": return pokemon.canEvolve;
      default: return true;
    }
  }

  function getStatKey(statDesc: string) {
    if (!statDesc) return "total";
    const lower = statDesc.toLowerCase();
    if (lower.includes("base stat")) return "total";
    if (lower.includes("special attack")) return "special-attack";
    if (lower.includes("special defense")) return "special-defense";
    if (lower.includes("attack")) return "attack";
    if (lower.includes("hp")) return "hp";
    if (lower.includes("defense")) return "defense";
    if (lower.includes("speed")) return "speed";
    return "total";
  }

  function getPokemonStat(pokemon: any, key: string) {
    if (!pokemon || !pokemon.stats) return 0;
    if (key === "total") {
      return pokemon.stats.reduce((acc: number, s: any) => acc + s.base_stat, 0);
    }
    const stat = pokemon.stats.find((s: any) => s.stat.name === key);
    return stat ? stat.base_stat : 0;
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.on("error", (err) => {
    console.error("[HTTP] Server error:", err);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
