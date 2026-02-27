import express from "express";

const app = express();
app.use(express.json());

// Game State Management (In-memory for dev, would be DB for production)
// NOTE: In-memory state will reset frequently on Vercel due to serverless architecture.
const globalAny: any = global;
if (!globalAny.rooms) {
  globalAny.rooms = new Map<string, any>();
}
const rooms = globalAny.rooms;

// API Routes
app.post("/api/rooms/create", (req, res) => {
  const { playerName, playerId: existingId } = req.body;
  const cleanPlayerName = playerName?.trim();

  if (!cleanPlayerName) {
    return res.status(400).json({ error: "Trainer Name is required" });
  }

  // Generate a unique 6-character ID
  let roomId;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  do {
    roomId = '';
    for (let i = 0; i < 6; i++) roomId += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (rooms.has(roomId));

  const room = {
    id: roomId,
    players: [],
    status: "LOBBY",
    round: 0,
    maxRounds: 0,
    currentWheels: null,
    history: [],
    lastUpdate: Date.now()
  };
  rooms.set(roomId, room);

  const playerId = existingId || Math.random().toString(36).substr(2, 9);
  const player = {
    id: playerId,
    name: cleanPlayerName,
    points: 0,
    money: 0,
    collection: [],
    selectedPokemon: null,
    hasSkipped: false,
    isHost: true,
    lastSeen: Date.now()
  };
  room.players.push(player);

  res.json({ playerId: player.id, room: getSanitizedRoom(room) });
});

app.post("/api/rooms/join", (req, res) => {
  const { roomId, playerName, playerId: existingId } = req.body;
  const cleanRoomId = roomId?.trim().toUpperCase();
  const cleanPlayerName = playerName?.trim();

  if (!cleanRoomId || !cleanPlayerName) {
    return res.status(400).json({ error: "Name and Room ID are required" });
  }

  const room = rooms.get(cleanRoomId);
  if (!room) {
    return res.status(404).json({ error: "Lobby not found. Please check the code." });
  }

  let player = room.players.find((p: any) => existingId && p.id === existingId);

  if (player) {
    player.name = cleanPlayerName;
    player.lastSeen = Date.now();
  } else {
    if (room.players.length >= 6) return res.status(400).json({ error: "Room is full" });
    if (room.status !== "LOBBY") return res.status(400).json({ error: "Game already started" });

    const newId = Math.random().toString(36).substr(2, 9);
    player = {
      id: newId,
      name: cleanPlayerName,
      points: 0,
      money: 0,
      collection: [],
      selectedPokemon: null,
      hasSkipped: false,
      isHost: room.players.length === 0,
      lastSeen: Date.now()
    };
    room.players.push(player);
  }

  room.lastUpdate = Date.now();
  res.json({ playerId: player.id, room: getSanitizedRoom(room) });
});

app.get("/api/rooms/:id", (req, res) => {
  const room = rooms.get(req.params.id.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });
  
  const pId = req.query.playerId as string;
  if (pId) {
    const player = room.players.find((p: any) => p.id === pId);
    if (player) player.lastSeen = Date.now();
  }

  res.json(getSanitizedRoom(room));
});

app.post("/api/rooms/:id/action", (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const { playerId, type, payload } = req.body;
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const player = room.players.find((p: any) => p.id === playerId);
  if (!player) return res.status(403).json({ error: "Player not in room" });

  switch (type) {
    case "START_GAME":
      if (player.isHost && room.status === "LOBBY" && room.players.length >= 2) {
        room.status = "PLAYING";
        room.maxRounds = room.players.length * 3;
        room.round = 1;
        startRound(room);
      }
      break;
    case "BUY_PACK":
      if (player.money >= payload.cost) {
        player.money -= payload.cost;
        player.collection.push(...payload.pokemon);
      }
      break;
    case "SELECT_POKEMON":
      if (room.status !== "PLAYING") break;
      player.selectedPokemon = payload.pokemon;
      player.hasSkipped = payload.skipped || false;
      checkRoundEnd(room);
      break;
    case "LEAVE_ROOM":
      room.players = room.players.filter((p: any) => p.id !== playerId);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        if (!room.players.some((p: any) => p.isHost)) {
          room.players[0].isHost = true;
        }
        if (room.status === "PLAYING") checkRoundEnd(room);
      }
      break;
    case "RETURN_TO_LOBBY":
      if (player.isHost) {
        room.status = "LOBBY";
        room.players.forEach((p: any) => {
          p.points = 0;
          p.money = 0;
          p.collection = [];
          p.selectedPokemon = null;
          p.hasSkipped = false;
        });
      }
      break;
  }

  room.lastUpdate = Date.now();
  res.json(getSanitizedRoom(room));
});

app.delete("/api/rooms/:id", (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const playerId = req.query.playerId as string;
  
  console.log(`[Server] Delete request for ${roomId} from ${playerId}`);
  
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const player = room.players.find((p: any) => p.id === playerId);
  if (player?.isHost) {
    console.log(`[Server] Room ${roomId} deleted by host ${player.name}`);
    rooms.delete(roomId);
    return res.json({ success: true });
  }
  
  res.status(403).json({ error: "Only the host can delete the lobby" });
});

function getSanitizedRoom(room: any) {
  if (!room) return null;
  const now = Date.now();
  return {
    id: room.id,
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    currentWheels: room.currentWheels,
    lastUpdate: room.lastUpdate,
    lastWinners: room.lastWinners,
    lastPlays: room.lastPlays,
    players: room.players.map((p: any) => ({
      id: p.id,
      name: p.name,
      points: p.points,
      money: p.money,
      collection: p.collection,
      hasSelected: !!p.selectedPokemon || p.hasSkipped,
      hasSkipped: p.hasSkipped,
      isHost: p.isHost,
      isOnline: (now - p.lastSeen) < 15000,
    })),
  };
}

function startRound(room: any) {
  room.players.forEach((p: any) => {
    p.money += 10;
    p.selectedPokemon = null;
    p.hasSkipped = false;
  });

  const statOptions = ["highest base stat", "highest attack", "highest special attack", "highest hp", "highest defense", "highest special defense", "highest speed", "lowest base stat", "lowest attack", "lowest special attack", "lowest hp", "lowest defense", "lowest special defense", "lowest speed"];
  const twistOptions = ["comes from 3 stage line", "comes from 2 stage line", "comes from one stage line", "cannot evolve", "can evolve"];

  room.currentWheels = {
    stat: statOptions[Math.floor(Math.random() * statOptions.length)],
    twist: twistOptions[Math.floor(Math.random() * twistOptions.length)],
  };
  room.lastUpdate = Date.now();
}

function checkRoundEnd(room: any) {
  if (room.status !== "PLAYING") return;
  const allReady = room.players.every((p: any) => p.selectedPokemon || p.hasSkipped);
  if (allReady) {
    room.status = "RESOLVING";
    resolveRound(room);
  }
}

function resolveRound(room: any) {
  const playersWhoPlayed = room.players.filter((p: any) => p.selectedPokemon && !p.hasSkipped);
  let winners: any[] = [];

  if (playersWhoPlayed.length === 0) {
    room.players.forEach((p: any) => p.points += 1);
    winners = room.players;
  } else if (playersWhoPlayed.length === 1) {
    playersWhoPlayed[0].points += 1;
    winners = [playersWhoPlayed[0]];
  } else {
    const compliantPlayers = playersWhoPlayed.filter((p: any) => isCompliant(p.selectedPokemon, room.currentWheels.twist));
    if (compliantPlayers.length === 1) {
      compliantPlayers[0].points += 1;
      winners = [compliantPlayers[0]];
    } else if (compliantPlayers.length > 1) {
      const statKey = getStatKey(room.currentWheels.stat);
      const isHighest = room.currentWheels.stat.startsWith("highest");
      let bestValue = isHighest ? -Infinity : Infinity;
      let roundWinners: any[] = [];

      compliantPlayers.forEach((p: any) => {
        const val = getPokemonStat(p.selectedPokemon, statKey);
        if (isHighest ? val > bestValue : val < bestValue) {
          bestValue = val;
          roundWinners = [p];
        } else if (val === bestValue) {
          roundWinners.push(p);
        }
      });
      roundWinners.forEach(p => p.points += 1);
      winners = roundWinners;
    }
  }

  room.lastWinners = winners.map(p => p.id);
  
  room.lastPlays = room.players.map((p: any) => ({
    playerId: p.id,
    pokemon: p.selectedPokemon,
    skipped: p.hasSkipped
  }));

  room.players.forEach((p: any) => {
    if (p.selectedPokemon) {
      const idx = p.collection.findIndex((poke: any) => poke.id === p.selectedPokemon.id);
      if (idx !== -1) p.collection.splice(idx, 1);
    }
  });

  room.lastUpdate = Date.now();

  setTimeout(() => {
    if (room.round < room.maxRounds) {
      room.round += 1;
      room.status = "PLAYING";
      startRound(room);
    } else {
      room.status = "FINISHED";
    }
    room.lastUpdate = Date.now();
  }, 8000);
}

function isCompliant(pokemon: any, twist: string) {
  if (!pokemon) return false;
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
  if (key === "total") return pokemon.stats.reduce((acc: number, s: any) => acc + s.base_stat, 0);
  const stat = pokemon.stats.find((s: any) => s.stat.name === key);
  return stat ? stat.base_stat : 0;
}

export default app;
