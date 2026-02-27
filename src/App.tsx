import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'steel', 'fairy'
];

export default function App() {
  const [room, setRoom] = useState<GameState | null>(null);
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('poke_name') || '');
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [myId, setMyId] = useState(() => sessionStorage.getItem('poke_id'));
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [loadingPack, setLoadingPack] = useState(false);
  const [socketReady, setSocketReady] = useState(true);

  const me = room?.players.find(p => p.id === myId);

  const roomRef = useRef(room);
  const meRef = useRef(me);

  useEffect(() => {
    roomRef.current = room;
    meRef.current = me;
  }, [room, me]);

  useEffect(() => {
    if (playerName) sessionStorage.setItem('poke_name', playerName);
  }, [playerName]);

  useEffect(() => {
    if (myId) sessionStorage.setItem('poke_id', myId);
  }, [myId]);

  // Polling for state updates
  useEffect(() => {
    if (!isJoined || !room?.id) return;

    let lastRound = room.round;
    let lastStatus = room.status;

    const poll = async () => {
      try {
        const currentRoom = roomRef.current;
        const currentMe = meRef.current;

        const res = await fetch(`/api/rooms/${room.id}?playerId=${myId}&t=${Date.now()}`);
        if (res.status === 404) {
          if (currentRoom) {
            // Restore room from memory (any player can do this if server restarts)
            await fetch(`/api/rooms/${room.id}/restore`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ room: currentRoom })
            });
          }
          return;
        }
        const data = await res.json();
        
        if (data.status === 'DELETED') {
          alert("The host has closed the lobby.");
          setIsJoined(false);
          setRoom(null);
          return;
        }

        // Handle transitions
        if (data.status === 'PLAYING' && lastStatus === 'LOBBY') {
          setIsSpinning(true);
          setShowResult(false);
          setTimeout(() => setIsSpinning(false), 3000);
        } else if (data.round > lastRound) {
          setIsSpinning(true);
          setShowResult(false);
          setTimeout(() => setIsSpinning(false), 3000);
        }

        if (data.lastWinners && data.status !== 'LOBBY') {
          setWinners(data.lastWinners);
          setShowResult(data.status === 'RESOLVING' || data.status === 'FINISHED');
        } else {
          setShowResult(false);
        }

        setRoom(data);
        lastRound = data.round;
        lastStatus = data.status;
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [isJoined, room?.id, myId]);

  const joinRoom = async (id?: string) => {
    const rId = (id || roomId).trim().toUpperCase();
    const pName = playerName.trim();
    if (!rId || !pName) {
      alert("Please enter both your name and a lobby code.");
      return;
    }

    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: rId, playerName: pName, playerId: myId })
      });
      const data = await res.json();
      if (res.ok) {
        setMyId(data.playerId);
        setRoom(data.room);
        setIsJoined(true);
      } else {
        alert(data.error || "Failed to join room");
      }
    } catch (e) {
      alert("Server connection error. Please try again.");
    }
  };

  const createRoom = async () => {
    const pName = playerName.trim();
    if (!pName) {
      alert("Please enter your name first");
      return;
    }

    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: pName, playerId: myId })
      });
      const data = await res.json();
      if (res.ok) {
        setMyId(data.playerId);
        setRoom(data.room);
        setIsJoined(true);
      } else {
        alert(data.error || "Failed to create room");
      }
    } catch (e) {
      alert("Server connection error. Please try again.");
    }
  };

  const leaveRoom = async () => {
    await fetch(`/api/rooms/${room?.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myId, type: 'LEAVE_ROOM' })
    });
    setIsJoined(false);
    setRoom(null);
  };

  const startGame = async () => {
    await fetch(`/api/rooms/${room?.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myId, type: 'START_GAME' })
    });
  };

  const deleteRoom = async () => {
    if (!myId || !room?.id) return;
    if (confirm("Are you sure you want to delete this lobby? This will kick all players.")) {
      try {
        const res = await fetch(`/api/rooms/${room.id}?playerId=${myId}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          setIsJoined(false);
          setRoom(null);
        } else {
          const data = await res.json();
          alert(data.error || "Failed to delete room");
        }
      } catch (e) {
        alert("Connection error. Could not delete lobby.");
      }
    }
  };

  const buyPack = async (type: string, cost: number) => {
    if (loadingPack) return;
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
      
      await fetch(`/api/rooms/${room?.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          playerId: myId, 
          type: 'BUY_PACK', 
          payload: { cost, pokemon } 
        })
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPack(false);
    }
  };

  const selectPokemon = async (pokemon: Pokemon | null, skipped = false) => {
    await fetch(`/api/rooms/${room?.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        playerId: myId, 
        type: 'SELECT_POKEMON', 
        payload: { pokemon, skipped } 
      })
    });
  };

  const syncState = () => {
    // Polling handles this automatically
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
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors uppercase"
                  />
                  <button 
                    onClick={() => joinRoom()}
                    disabled={!socketReady}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
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
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-black uppercase tracking-widest italic">Joining Lobby...</p>
      </div>
    );
  }

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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Game Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black italic uppercase tracking-tighter">Round {room.round} / {room.maxRounds}</h2>
              <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-500 text-[10px] font-bold uppercase tracking-widest">
                {room.status}
              </div>
            </div>
            <p className="text-white/40 text-xs uppercase tracking-widest mt-1">Lobby: {room.id}</p>
          </div>

          <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Coins className="w-5 h-5 text-black" />
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase font-bold leading-none">Your Balance</p>
                <p className="text-xl font-black italic">${me?.money}</p>
              </div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-black" />
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase font-bold leading-none">Your Points</p>
                <p className="text-xl font-black italic">{me?.points}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Wheels & Selection */}
          <div className="lg:col-span-8 space-y-8">
            {/* Wheels Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.div 
                animate={isSpinning ? { rotateX: [0, 360, 720, 1080] } : {}}
                className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 rounded-3xl shadow-xl relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <Zap className="w-32 h-32" />
                </div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-200 mb-2">Stat Wheel</p>
                <h3 className="text-3xl font-black italic uppercase tracking-tighter leading-none">
                  {isSpinning ? "Spinning..." : room.currentWheels?.stat}
                </h3>
              </motion.div>

              <motion.div 
                animate={isSpinning ? { rotateX: [0, -360, -720, -1080] } : {}}
                className="bg-gradient-to-br from-amber-500 to-amber-700 p-6 rounded-3xl shadow-xl relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <Shield className="w-32 h-32" />
                </div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-amber-200 mb-2">Twist Wheel</p>
                <h3 className="text-3xl font-black italic uppercase tracking-tighter leading-none">
                  {isSpinning ? "Spinning..." : room.currentWheels?.twist}
                </h3>
              </motion.div>
            </div>

            {/* Selection Area */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black italic uppercase tracking-tighter">Your Collection</h3>
                <button 
                  onClick={() => selectPokemon(null, true)}
                  disabled={me?.hasSelected}
                  className="text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors disabled:opacity-0"
                >
                  Skip this round
                </button>
              </div>

              {me?.collection.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl text-white/20">
                  <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-sm">Your collection is empty</p>
                  <p className="text-xs mt-1">Buy a pack to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {me?.collection.map((poke, i) => (
                    <motion.button
                      key={`${poke.id}-${i}`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => selectPokemon(poke)}
                      disabled={me?.hasSelected}
                      className={cn(
                        "relative aspect-[3/4] rounded-2xl p-4 flex flex-col items-center justify-between transition-all group overflow-hidden",
                        me?.hasSelected ? "opacity-50 grayscale cursor-not-allowed" : "hover:shadow-2xl hover:shadow-emerald-500/20",
                        "bg-white/5 border border-white/10"
                      )}
                    >
                      <img 
                        src={poke.image} 
                        alt={poke.name}
                        className="w-full h-auto drop-shadow-2xl group-hover:scale-110 transition-transform"
                      />
                      <div className="text-center w-full">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 truncate">{poke.name}</p>
                        <div className="flex justify-center gap-1 mt-1">
                          {poke.types.map(t => (
                            <div key={t} className="w-1.5 h-1.5 rounded-full bg-emerald-500" title={t} />
                          ))}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Shop & Leaderboard */}
          <div className="lg:col-span-4 space-y-8">
            {/* Shop */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] p-8">
              <h3 className="text-xl font-black italic uppercase tracking-tighter mb-6 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                Pack Shop
              </h3>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                <PackButton 
                  title="Legendary Pack" 
                  price={20} 
                  icon={<Star className="w-4 h-4" />}
                  color="amber"
                  onClick={() => buyPack('legendary', 20)}
                  disabled={me?.money < 20 || loadingPack}
                />
                <PackButton 
                  title="Baby Pack" 
                  price={20} 
                  icon={<Heart className="w-4 h-4" />}
                  color="pink"
                  onClick={() => buyPack('baby', 20)}
                  disabled={me?.money < 20 || loadingPack}
                />
                
                <div className="h-px w-full bg-white/10 my-4" />
                <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Type Packs ($10)</h4>
                
                {POKEMON_TYPES.map(type => (
                  <PackButton 
                    key={type}
                    title={`${type} Pack`} 
                    price={10} 
                    icon={<Zap className="w-4 h-4" />}
                    color="emerald"
                    onClick={() => buyPack(type, 10)}
                    disabled={me?.money < 10 || loadingPack}
                  />
                ))}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] p-8">
              <h3 className="text-xl font-black italic uppercase tracking-tighter mb-6 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Trainers
              </h3>
              <div className="space-y-4">
                {room.players.sort((a, b) => b.points - a.points).map((player, i) => (
                  <div key={player.id} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-black italic text-white/20">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-bold text-sm flex items-center gap-2">
                          {player.name}
                          {player.hasSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        </p>
                        <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest">{player.points} Points</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black italic text-emerald-500">${player.money}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Result Overlay */}
      <AnimatePresence>
        {showResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-5xl bg-[#1a1a1a] border border-white/10 rounded-[3rem] p-8 md:p-12 text-center shadow-2xl my-8"
            >
              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
                <Trophy className="w-10 h-10 text-black" />
              </div>
              <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter mb-8">Round Results</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
                {room.lastPlays?.map((play, idx) => {
                  const player = room.players.find(p => p.id === play.playerId);
                  const isWinner = room.lastWinners?.includes(play.playerId);
                  return (
                    <div key={idx} className={cn(
                      "bg-white/5 border rounded-2xl p-4 flex flex-col items-center relative",
                      isWinner ? "border-emerald-500 shadow-lg shadow-emerald-500/20" : "border-white/10 opacity-70"
                    )}>
                      {isWinner && (
                        <div className="absolute -top-3 -right-3 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                          <Star className="w-4 h-4 text-black" />
                        </div>
                      )}
                      <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-2 truncate w-full">{player?.name}</p>
                      {play.skipped || !play.pokemon ? (
                        <div className="flex-1 flex items-center justify-center py-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Skipped</p>
                        </div>
                      ) : (
                        <>
                          <img src={play.pokemon.image} alt={play.pokemon.name} className="w-20 h-20 object-contain mb-2 drop-shadow-lg" />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80 truncate w-full">{play.pokemon.name}</p>
                          <div className="flex gap-1 mt-1 mb-2">
                            {play.pokemon.types.map(t => (
                              <div key={t} className="w-1.5 h-1.5 rounded-full bg-emerald-500" title={t} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 mb-8">
                {winners.length > 0 ? (
                  winners.map(wId => {
                    const winner = room.players.find(p => p.id === wId);
                    return (
                      <div key={wId} className="text-2xl font-black italic text-emerald-500 uppercase tracking-tighter">
                        {winner?.name} Wins!
                      </div>
                    );
                  })
                ) : (
                  <div className="text-2xl font-black italic text-red-500 uppercase tracking-tighter">No Winners This Round</div>
                )}
              </div>

              <div className="bg-white/5 rounded-3xl p-6 border border-white/10 max-w-md mx-auto">
                {room.status === 'FINISHED' ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-white font-bold uppercase tracking-widest text-xl text-amber-500">Game Over!</p>
                    {me?.isHost ? (
                      <button 
                        onClick={async () => {
                          await fetch(`/api/rooms/${room.id}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ playerId: myId, type: 'RETURN_TO_LOBBY' })
                          });
                        }}
                        className="bg-emerald-500 text-black px-6 py-3 rounded-xl font-black italic uppercase tracking-tighter hover:bg-emerald-400 transition-colors w-full"
                      >
                        Return to Lobby
                      </button>
                    ) : (
                      <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Waiting for host to return to lobby...</p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Next round starting soon...</p>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 8 }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PackButton({ title, price, icon, color, onClick, disabled }: any) {
  const colors: any = {
    emerald: "from-emerald-500 to-emerald-700 shadow-emerald-500/20",
    pink: "from-pink-500 to-pink-700 shadow-pink-500/20",
    amber: "from-amber-500 to-amber-700 shadow-amber-500/20"
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full p-4 rounded-2xl flex items-center justify-between transition-all active:scale-95 disabled:opacity-50 disabled:grayscale",
        "bg-gradient-to-r shadow-lg",
        colors[color]
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-black/20 rounded-lg flex items-center justify-center">
          {icon}
        </div>
        <span className="font-black italic uppercase tracking-tighter text-lg">{title}</span>
      </div>
      <span className="font-black italic text-xl">${price}</span>
    </button>
  );
}
