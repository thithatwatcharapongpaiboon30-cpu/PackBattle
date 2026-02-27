import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Users, 
  Play, 
  ShoppingBag, 
  Coins, 
  ChevronRight, 
  RotateCcw,
  Info,
  Zap,
  Shield,
  Sword,
  Heart,
  Wind,
  Star,
  Skull
} from 'lucide-react';
import { GameState, Pokemon, Player } from './types';
import { getRandomPokemonByType, getRandomLegendary, getRandomBaby } from './services/pokeService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const POKEMON_TYPES = [
  'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
];

export default function App() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [room, setRoom] = useState<GameState | null>(null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('poke_name') || '');
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [myId, setMyId] = useState(() => localStorage.getItem('poke_id'));
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [loadingPack, setLoadingPack] = useState(false);
  const [socketReady, setSocketReady] = useState(false);

  const me = room?.players.find(p => p.id === myId);

  useEffect(() => {
    if (playerName) localStorage.setItem('poke_name', playerName);
  }, [playerName]);

  useEffect(() => {
    if (myId) localStorage.setItem('poke_id', myId);
  }, [myId]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;
    let heartbeatInterval: NodeJS.Timeout;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        console.log('[WS] Connected');
        setSocketReady(true);
        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'SYNC' }));
          }
        }, 10000);
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected. Reconnecting...');
        setSocketReady(false);
        clearInterval(heartbeatInterval);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case 'JOINED':
              setMyId(message.payload.playerId);
              setRoom(message.payload.room);
              setIsJoined(true);
              break;
            case 'ROOM_UPDATED':
              setRoom(message.payload);
              break;
            case 'ROOM_DELETED':
              alert("Room deleted by host");
              setIsJoined(false);
              setRoom(null);
              break;
            case 'ROUND_STARTED':
              setRoom(message.payload.room);
              setIsSpinning(true);
              setShowResult(false);
              setTimeout(() => setIsSpinning(false), 3000);
              break;
            case 'ROUND_RESOLVED':
              setWinners(message.payload.winners);
              setShowResult(true);
              setRoom(message.payload.room);
              break;
            case 'GAME_FINISHED':
              setRoom(message.payload);
              break;
            case 'ERROR':
              alert(message.payload);
              break;
          }
        } catch (e) { console.error(e); }
      };

      setSocket(ws);
    };

    connect();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
      clearInterval(heartbeatInterval);
    };
  }, []);

  const joinRoom = (id?: string) => {
    const rId = (id || roomId).trim().toUpperCase();
    const pName = playerName.trim();
    if (!rId || !pName || !socketReady) return;

    socket?.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: { roomId: rId, playerName: pName, playerId: myId }
    }));
  };

  const leaveRoom = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
    setIsJoined(false);
    setRoom(null);
  };

  const generateRoomId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomId(result);
    return result;
  };

  const createRoom = () => {
    if (!playerName.trim()) {
      alert("Please enter your name first");
      return;
    }
    const newId = generateRoomId();
    joinRoom(newId);
  };

  const startGame = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'START_GAME' }));
    }
  };

  const deleteRoom = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (confirm("Are you sure you want to delete this lobby?")) {
        socket.send(JSON.stringify({ type: 'DELETE_ROOM' }));
      }
    }
  };

  const buyPack = async (type: string, cost: number) => {
    if (loadingPack) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    setLoadingPack(true);
    try {
      let pokemon: Pokemon[] = [];
      if (type === 'legendary') {
        pokemon = await getRandomLegendary(3);
      } else if (type === 'baby') {
        pokemon = await getRandomBaby(3);
      } else {
        pokemon = await getRandomPokemonByType(type, 3);
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'BUY_PACK',
          payload: { pokemon, cost }
        }));
      }
    } finally {
      setLoadingPack(false);
    }
  };

  const selectPokemon = (pokemon: Pokemon | null, skipped = false) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'SELECT_POKEMON',
        payload: { pokemon, skipped }
      }));
    }
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center mb-4 shadow-xl shadow-emerald-500/20 rotate-3">
              <Trophy className="w-10 h-10 text-black" />
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-center">Pack Battle</h1>
            <div className="mt-2 flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                socketReady ? "bg-emerald-500" : "bg-red-500"
              )} />
              <span className="text-[10px] uppercase tracking-widest font-bold text-white/30">
                {socketReady ? "Server Online" : "Connecting..."}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1 block">Trainer Name</label>
              <input 
                type="text" 
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter name..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            
            <div className="pt-4 space-y-3">
              <button 
                onClick={createRoom}
                disabled={!socketReady}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
              >
                <Play className="w-5 h-5 fill-current" />
                {socketReady ? "CREATE NEW LOBBY" : "CONNECTING..."}
              </button>

              <div className="flex items-center gap-4 py-2">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">OR JOIN EXISTING</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1 block">Lobby Code</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="Enter code..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 transition-colors uppercase"
                  />
                  <button 
                    onClick={() => joinRoom()}
                    disabled={!socketReady}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    JOIN
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (isJoined && !room) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-black uppercase tracking-widest italic">Joining Lobby...</p>
      </div>
    );
  }

  const syncState = () => {
    if (socketReady && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'SYNC' }));
    }
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4" />
        <p className="font-black uppercase tracking-widest italic text-white/20">Establishing Connection...</p>
      </div>
    );
  }

  if (room?.status === 'LOBBY') {
    return (
      <div className="min-h-screen bg-[#121212] text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <div className="flex items-center gap-4">
                <h2 className="text-5xl font-black italic uppercase tracking-tighter">Lobby: {room.id}</h2>
                <button 
                  onClick={syncState}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/20 hover:text-white/60"
                  title="Sync State"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>
              <p className="text-white/50 mt-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                {room.players.length} / 6 Players Joined
              </p>
            </div>
            {me?.isHost && (
              <div className="flex gap-2">
                <button 
                  onClick={deleteRoom}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95"
                >
                  DELETE LOBBY
                </button>
                <button 
                  onClick={startGame}
                  disabled={room.players.length < 2}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black px-8 py-4 rounded-2xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                >
                  <Play className="w-6 h-6 fill-current" />
                  START GAME
                </button>
              </div>
            )}
            {!me?.isHost && (
              <div className="flex flex-col items-end gap-2">
                <button 
                  onClick={leaveRoom}
                  className="bg-white/5 hover:bg-white/10 text-white/40 border border-white/10 font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95"
                >
                  LEAVE LOBBY
                </button>
                <div className="bg-white/5 border border-white/10 text-white/40 px-6 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest">
                  Waiting for host to start...
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {room.players.map((player, idx) => (
              <motion.div 
                key={player.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "bg-[#1a1a1a] border p-6 rounded-3xl flex items-center gap-4 transition-colors",
                  player.isOnline ? "border-white/10" : "border-red-500/20 opacity-60"
                )}
              >
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center font-bold text-xl text-white/30 relative">
                  {idx + 1}
                  <div className={cn(
                    "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#1a1a1a]",
                    player.isOnline ? "bg-emerald-500" : "bg-red-500"
                  )} />
                </div>
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    {player.name} 
                    {player.isHost && <span className="text-emerald-500 text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-widest">Host</span>}
                  </h3>
                  <p className="text-xs text-white/40 uppercase tracking-widest">
                    {player.id === me?.id ? "You" : (player.isOnline ? "Ready to Rumble" : "Disconnected")}
                  </p>
                </div>
              </motion.div>
            ))}
            {Array.from({ length: 6 - room.players.length }).map((_, idx) => (
              <div key={idx} className="border border-dashed border-white/10 p-6 rounded-3xl flex items-center justify-center text-white/10 uppercase tracking-widest font-bold text-sm">
                Waiting...
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (room?.status === 'FINISHED') {
    const sortedPlayers = [...room.players].sort((a, b) => b.points - a.points);
    return (
      <div className="min-h-screen bg-[#121212] text-white p-8 flex flex-col items-center justify-center">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-2xl w-full bg-[#1a1a1a] border border-white/10 rounded-[40px] p-12 text-center shadow-2xl"
        >
          <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-6" />
          <h2 className="text-6xl font-black italic uppercase tracking-tighter mb-8">Final Standings</h2>
          <div className="space-y-4">
            {sortedPlayers.map((p, idx) => (
              <div key={p.id} className={cn(
                "flex items-center justify-between p-6 rounded-3xl border",
                idx === 0 ? "bg-yellow-500/10 border-yellow-500/50" : "bg-white/5 border-white/10"
              )}>
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black italic text-white/20">#{idx + 1}</span>
                  <span className="text-2xl font-bold">{p.name}</span>
                </div>
                <span className="text-3xl font-black">{p.points} PTS</span>
              </div>
            ))}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-12 text-white/40 hover:text-white transition-colors uppercase tracking-widest font-bold text-sm flex items-center gap-2 mx-auto"
          >
            <RotateCcw className="w-4 h-4" />
            Back to Menu
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-red-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-black italic uppercase tracking-tighter flex items-center gap-2">
              <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </div>
              Poke Roulette
            </h1>
            <div className="h-8 w-px bg-white/10" />
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest font-bold text-white/30">Round</span>
                <span className="text-xl font-black italic">{room.round} / {room.maxRounds}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {room.players.map(p => (
              <div key={p.id} className="flex flex-col items-end">
                <span className={cn(
                  "text-[10px] uppercase tracking-widest font-bold",
                  p.id === me?.id ? "text-red-500" : "text-white/30"
                )}>
                  {p.name} {p.id === me?.id && "(You)"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{p.points} PTS</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Wheels & Status */}
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-[#111] border border-white/10 rounded-[32px] p-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4">
              <Info className="w-5 h-5 text-white/10" />
            </div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-6">The Roulette</h3>
            
            <div className="space-y-6">
              <div className="relative">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-white/20 uppercase tracking-widest">Stat Wheel</span>
                  <div className={cn(
                    "h-20 rounded-2xl border flex items-center justify-center text-xl font-black italic uppercase tracking-tight transition-all duration-500",
                    isSpinning ? "bg-white/5 border-white/10 blur-sm" : "bg-red-500/10 border-red-500/50 text-red-500"
                  )}>
                    {isSpinning ? "Spinning..." : room.currentWheels?.stat}
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-white/20 uppercase tracking-widest">Twist Wheel</span>
                  <div className={cn(
                    "h-20 rounded-2xl border flex items-center justify-center text-xl font-black italic uppercase tracking-tight transition-all duration-500",
                    isSpinning ? "bg-white/5 border-white/10 blur-sm" : "bg-blue-500/10 border-blue-500/50 text-blue-500"
                  )}>
                    {isSpinning ? "Spinning..." : room.currentWheels?.twist}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <Coins className="w-5 h-5 text-yellow-500" />
                <span className="text-sm font-bold uppercase tracking-widest">Your Balance</span>
              </div>
              <span className="text-4xl font-black italic text-yellow-500">${me?.money}</span>
            </div>
          </section>

          <section className="bg-[#111] border border-white/10 rounded-[32px] p-8">
            <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-6">Player Status</h3>
            <div className="space-y-4">
              {room.players.map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="font-bold">{p.name}</span>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    p.hasSelected ? "bg-emerald-500/20 text-emerald-500" : "bg-white/5 text-white/20"
                  )}>
                    {p.hasSelected ? "Ready" : "Thinking"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Game Area */}
        <div className="lg:col-span-8 space-y-8">
          {/* Shop Section */}
          <section className="bg-[#111] border border-white/10 rounded-[40px] p-10">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-3">
                <ShoppingBag className="w-8 h-8" />
                Preparation Phase
              </h2>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Shop Open</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <button 
                onClick={() => buyPack('legendary', 20)}
                disabled={loadingPack || (me?.money || 0) < 20}
                className="group relative h-40 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-3xl p-6 flex flex-col justify-between hover:border-yellow-500 transition-all disabled:opacity-50 disabled:grayscale"
              >
                <Star className="w-8 h-8 text-yellow-500" />
                <div>
                  <h4 className="font-black italic uppercase text-lg leading-tight">Legendary Pack</h4>
                  <span className="text-yellow-500 font-bold">$20</span>
                </div>
              </button>

              <button 
                onClick={() => buyPack('baby', 20)}
                disabled={loadingPack || (me?.money || 0) < 20}
                className="group relative h-40 bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/30 rounded-3xl p-6 flex flex-col justify-between hover:border-pink-500 transition-all disabled:opacity-50 disabled:grayscale"
              >
                <Heart className="w-8 h-8 text-pink-500" />
                <div>
                  <h4 className="font-black italic uppercase text-lg leading-tight">Baby Pack</h4>
                  <span className="text-pink-500 font-bold">$20</span>
                </div>
              </button>

              {POKEMON_TYPES.slice(0, 2).map(type => (
                <button 
                  key={type}
                  onClick={() => buyPack(type, 10)}
                  disabled={loadingPack || (me?.money || 0) < 10}
                  className="group relative h-40 bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:border-white/30 transition-all disabled:opacity-50 disabled:grayscale"
                >
                  <Zap className="w-8 h-8 text-white/20" />
                  <div>
                    <h4 className="font-black italic uppercase text-lg leading-tight">{type} Pack</h4>
                    <span className="text-white/40 font-bold">$10</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
              {POKEMON_TYPES.slice(2).map(type => (
                <button 
                  key={type}
                  onClick={() => buyPack(type, 10)}
                  disabled={loadingPack || (me?.money || 0) < 10}
                  className="flex-shrink-0 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all disabled:opacity-50 text-xs font-black uppercase tracking-widest"
                >
                  {type} ($10)
                </button>
              ))}
            </div>
          </section>

          {/* Collection Section */}
          <section className="bg-[#111] border border-white/10 rounded-[40px] p-10">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-black italic uppercase tracking-tighter">Your Collection</h2>
              <button 
                onClick={() => selectPokemon(null, true)}
                disabled={me?.hasSelected}
                className="text-xs font-black uppercase tracking-widest text-white/20 hover:text-red-500 transition-colors disabled:opacity-0"
              >
                Skip Round
              </button>
            </div>

            {me?.collection.length === 0 ? (
              <div className="h-64 border-2 border-dashed border-white/5 rounded-[32px] flex flex-col items-center justify-center text-white/10">
                <RotateCcw className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-black uppercase tracking-widest">No Pokemon Yet</p>
                <p className="text-xs mt-2">Buy a pack to start battling</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                {me?.collection.map((p, idx) => (
                  <motion.div 
                    key={`${p.id}-${idx}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -5 }}
                    className={cn(
                      "group relative bg-[#1a1a1a] border rounded-[32px] p-4 transition-all cursor-pointer",
                      me.hasSelected ? "opacity-50 pointer-events-none" : "border-white/10 hover:border-red-500/50"
                    )}
                    onClick={() => selectPokemon(p)}
                  >
                    <div className="aspect-square bg-white/5 rounded-2xl mb-4 p-4 flex items-center justify-center relative overflow-hidden">
                      <img src={p.image} alt={p.name} className="w-full h-full object-contain relative z-10" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                    </div>
                    <h4 className="font-black italic uppercase text-center mb-4 truncate">{p.name}</h4>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 rounded-xl p-2 flex flex-col items-center">
                        <span className="text-[8px] uppercase font-bold text-white/20">ATK</span>
                        <span className="text-xs font-black">{p.stats.find(s => s.stat.name === 'attack')?.base_stat}</span>
                      </div>
                      <div className="bg-white/5 rounded-xl p-2 flex flex-col items-center">
                        <span className="text-[8px] uppercase font-bold text-white/20">DEF</span>
                        <span className="text-xs font-black">{p.stats.find(s => s.stat.name === 'defense')?.base_stat}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Round Result Overlay */}
      <AnimatePresence>
        {showResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-8"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-xl w-full text-center"
            >
              <div className="w-24 h-24 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(234,179,8,0.3)]">
                <Trophy className="w-12 h-12 text-black" />
              </div>
              <h2 className="text-7xl font-black italic uppercase tracking-tighter mb-4">Round Result</h2>
              <p className="text-white/40 uppercase tracking-[0.3em] font-bold mb-12">Winners of this round</p>
              
              <div className="space-y-4">
                {winners.length > 0 ? winners.map(wid => {
                  const winner = room.players.find(p => p.id === wid);
                  return (
                    <div key={wid} className="bg-white/5 border border-white/10 p-6 rounded-3xl flex items-center justify-between">
                      <span className="text-2xl font-black italic">{winner?.name}</span>
                      <span className="text-emerald-500 font-black">+1 POINT</span>
                    </div>
                  );
                }) : (
                  <div className="text-white/20 font-black italic text-2xl">No winners this round</div>
                )}
              </div>

              <div className="mt-12 flex items-center justify-center gap-4">
                <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 5 }}
                    className="h-full bg-red-500"
                  />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Next Round Starting...</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay for Packs */}
      <AnimatePresence>
        {loadingPack && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="font-black uppercase tracking-widest italic">Opening Pack...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
