export interface Pokemon {
  id: number;
  name: string;
  types: string[];
  stats: { base_stat: number; stat: { name: string } }[];
  image: string;
  evolutionLineLength: number;
  canEvolve: boolean;
  isLegendary: boolean;
  isBaby: boolean;
}

export interface GameState {
  id: string;
  players: Player[];
  status: 'LOBBY' | 'PLAYING' | 'FINISHED';
  round: number;
  maxRounds: number;
  currentWheels: {
    stat: string;
    twist: string;
  } | null;
}

export interface Player {
  id: string;
  name: string;
  points: number;
  money: number;
  collection: Pokemon[];
  hasSelected: boolean;
  hasSkipped: boolean;
  isHost: boolean;
}
