export type WorldKind = "country" | "city" | "faction" | "concept";
export type EntryKind = WorldKind | "operator" | "enemy" | "item";
export type Zone = "north" | "east" | "central" | "west" | "south" | "special";
export interface Section {
  title: string;
  body: string;
  spoiler?: boolean;
}
export interface SourceRef {
  id: string;
  title: string;
  url: string;
  publisher: string;
  checkedAt: string;
  note?: string;
}
export interface EntryRelationship {
  target: string;
  label: string;
  spoiler?: boolean;
}
export interface EntryBase {
  id: string;
  kind: EntryKind;
  name: string;
  en: string;
  aliases: string[];
  tagline: string;
  summary: string;
  zone?: Zone;
  tags: string[];
  facts: { label: string; value: string }[];
  sections: Section[];
  related: string[];
  sources: string[];
  regionId?: string;
  relationships?: EntryRelationship[];
  checkedAt?: string;
  missingFacts?: string[];
}
export interface WorldEntry extends EntryBase {
  kind: WorldKind;
  zone: Zone;
}
export interface OperatorEntry extends EntryBase {
  kind: "operator";
  operator: {
    rarity: number;
    profession: string;
    branch: string;
    race: string;
    birthplace: string;
    affiliation: string;
    trait: string;
    talents: string[];
    skills: { name: string; summary: string }[];
    stats?: {
      hp: number;
      atk: number;
      def: number;
      res: number;
      block: number;
      cost: number;
      redeploy: number;
      basis: string;
    };
  };
}
export interface EnemyEntry extends EntryBase {
  kind: "enemy";
  enemy: {
    code: string;
    rank: string;
    species: string;
    movement: string;
    attackType: string;
    abilities: string[];
    stages?: string[];
    stats?: {
      hp: number;
      atk: number;
      def: number;
      res: number;
      basis: string;
    };
  };
}
export interface ItemEntry extends EntryBase {
  kind: "item";
  item: {
    category: string;
    rarity?: number;
    usage: string;
    acquisition: string[];
    recipe?: {
      ingredients: {
        name: string;
        quantity: number;
        entryId?: string;
        url?: string;
      }[];
      quantity: number;
      cost?: number;
      facility?: string;
    };
    historical?: boolean;
  };
}
export type ArchiveEntry = WorldEntry | OperatorEntry | EnemyEntry | ItemEntry;
export type Point = [number, number];
export interface MapRegion {
  id: string;
  center: Point;
  polygon: Point[];
  elevation: number;
  special?: boolean;
}
export interface MapMarker {
  id: string;
  point: Point;
  regionId: string;
}
export interface TimelineEvent {
  id: string;
  title: string;
  label: string;
  year: number;
  summary: string;
  related: string[];
  source: string;
  spoiler: boolean;
}
export interface Layers {
  countries: boolean;
  cities: boolean;
  relations: boolean;
}
export interface Preferences {
  version: 1;
  favorites: string[];
  visited: string[];
  spoilers: boolean;
  reducedMotion: boolean;
  sound: boolean;
}
export type AppView = "atlas" | "archive" | "favorites" | "about";
