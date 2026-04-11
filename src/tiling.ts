/**
 * FLUX Tiling System — Vocabulary compounds into higher-order vocabulary.
 * Level 0 primitives → Level N domain concepts.
 * Higher-level tiles don't need more bytecode — they just arrange
 * existing bytecode in more sophisticated ways.
 */

import { VocabEntry, matchVocabulary } from "./vocabulary";

export interface Tile extends VocabEntry {
  depends: string[]; // Names of tiles this depends on
}

export interface TileComposition {
  name: string;
  level: number;
  depends: string[];
  resolvedLevels: number[];
  pattern: string;
  assembly: string;
}

export class TilingEngine {
  private tiles: Map<string, Tile> = new Map();
  private baseEntries: VocabEntry[];

  constructor(baseEntries: VocabEntry[]) {
    this.baseEntries = baseEntries;
    for (const entry of baseEntries) {
      this.tiles.set(entry.name, {
        ...entry,
        depends: [],
      });
    }
  }

  registerTile(tile: Tile) {
    this.tiles.set(tile.name, tile);
  }

  /** Compose tiles: resolve dependencies, return in execution order */
  compose(tileName: string): TileComposition[] {
    const tile = this.tiles.get(tileName);
    if (!tile) return [];

    const visited = new Set<string>();
    const result: TileComposition[] = [];

    const resolve = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const t = this.tiles.get(name);
      if (!t) return;

      // Resolve dependencies first
      for (const dep of t.depends) {
        resolve(dep);
      }

      result.push({
        name: t.name,
        level: t.level,
        depends: t.depends,
        resolvedLevels: t.depends
          .map((d) => this.tiles.get(d)?.level ?? -1)
          .filter((l) => l >= 0),
        pattern: t.pattern,
        assembly: t.assembly,
      });
    };

    resolve(tileName);
    return result;
  }

  /** Match text against the highest-level tile possible */
  matchHighestTile(text: string, languageCode: string): Tile | null {
    const langTiles = Array.from(this.tiles.values())
      .filter((t) => t.languageCode === languageCode || t.languageCode === "universal")
      .sort((a, b) => b.level - a.level); // Highest level first

    for (const tile of langTiles) {
      if (matchVocabulary(text, [tile])) {
        return tile;
      }
    }
    return null;
  }

  getAllTiles(): Tile[] {
    return Array.from(this.tiles.values());
  }

  getTilesByLevel(level: number): Tile[] {
    return Array.from(this.tiles.values()).filter((t) => t.level === level);
  }

  getMaxLevel(): number {
    return Math.max(0, ...Array.from(this.tiles.values()).map((t) => t.level));
  }
}
