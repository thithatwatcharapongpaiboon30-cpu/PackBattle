import { Pokemon } from "../types";

const CACHE: Record<string, any> = {};

async function fetchWithCache(url: string) {
  if (CACHE[url]) return CACHE[url];
  const res = await fetch(url);
  const data = await res.json();
  CACHE[url] = data;
  return data;
}

export async function getPokemonData(idOrName: string | number): Promise<Pokemon> {
  const data = await fetchWithCache(`https://pokeapi.co/api/v2/pokemon/${idOrName}`);
  const species = await fetchWithCache(data.species.url);
  const evolutionChain = await fetchWithCache(species.evolution_chain.url);

  // Calculate evolution line length and if it can evolve
  let lineLength = 0;
  let canEvolve = false;

  function traverse(node: any, depth: number) {
    lineLength = Math.max(lineLength, depth);
    if (node.species.name === species.name) {
      canEvolve = node.evolves_to.length > 0;
    }
    node.evolves_to.forEach((next: any) => traverse(next, depth + 1));
  }
  traverse(evolutionChain.chain, 1);

  return {
    id: data.id,
    name: data.name,
    types: data.types.map((t: any) => t.type.name),
    stats: data.stats,
    image: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
    evolutionLineLength: lineLength,
    canEvolve: canEvolve,
    isLegendary: species.is_legendary || species.is_mythical,
    isBaby: species.is_baby,
  };
}

export async function getRandomPokemonByType(type: string, count: number): Promise<Pokemon[]> {
  const typeData = await fetchWithCache(`https://pokeapi.co/api/v2/type/${type}`);
  const pokemonList = typeData.pokemon.filter((p: any) => {
    const name = p.pokemon.name.toLowerCase();
    return !name.includes('-mega') && !name.includes('-gmax') && !name.includes('-dynamax');
  });
  const results: Pokemon[] = [];
  
  for (let i = 0; i < count; i++) {
    const randomEntry = pokemonList[Math.floor(Math.random() * pokemonList.length)];
    const p = await getPokemonData(randomEntry.pokemon.name);
    results.push(p);
  }
  return results;
}

export async function getRandomPokemon(count: number): Promise<Pokemon[]> {
  const results: Pokemon[] = [];
  for (let i = 0; i < count; i++) {
    // Random ID between 1 and 898 (Gen 8 limit to avoid missing sprites)
    const id = Math.floor(Math.random() * 898) + 1;
    results.push(await getPokemonData(id));
  }
  return results;
}

export async function getRandomLegendary(count: number): Promise<Pokemon[]> {
  // This is a bit tricky with PokeAPI, let's use a list of legendary IDs or just filter from a range
  // For simplicity, let's pick from a known list of legendary/mythical or just random high IDs
  const legendaries = [144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386];
  const results: Pokemon[] = [];
  for (let i = 0; i < count; i++) {
    const id = legendaries[Math.floor(Math.random() * legendaries.length)];
    results.push(await getPokemonData(id));
  }
  return results;
}

export async function getRandomBaby(count: number): Promise<Pokemon[]> {
  const babies = [172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440, 446, 447, 458];
  const results: Pokemon[] = [];
  for (let i = 0; i < count; i++) {
    const id = babies[Math.floor(Math.random() * babies.length)];
    results.push(await getPokemonData(id));
  }
  return results;
}
