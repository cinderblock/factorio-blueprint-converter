export type BlueprintData = {
  version: Version;
  expansions: Record<string, string[]>;
  saveTime: Date;
  generationCounter: number;
  blueprints: BlueprintEntry[];
};
type Version = {
  major: number;
  minor: number;
  patch: number;
  developer: number;
};
export namespace Index {
  export type Types = 'ITEM' | 'FLUID' | 'VSIGNAL' | 'TILE' | 'ENTITY' | 'RECIPE' | 'EQUIPMENT' | 'QUALITY' | 'PLANET';
  export type Entry = {
    prototype: string;
    name: string;
    id: number;
  };
}

export type BlueprintEntry = null | Blueprint | BlueprintBook | DeconstructionPlanner | UpgradePlanner;

export type Blueprint = {
  key: 'blueprint';
  generation: number;
  label: string;
  description: string;
  data: Buffer;
};

export type BlueprintBook = {
  key: 'blueprint_book';
  generation: number;
  label: string;
  description: string;
  icons: { index: number; signal: Sig }[];
  blueprints: BlueprintEntry[];
  activeIndex: number;
};
export type DeconstructionPlanner = {
  key: 'deconstruction_planner';
  generation: number;
  label: string;
  description: string;
  icons: { index: number; signal: Sig }[];
  entityFilterMode: number;
  entityFilters: { index: number; name: string }[];
  treesRocksOnly: boolean;
  tileFilterMode: number;
  tileSelectionMode: number;
  tileFilters: { index: number; name: string }[];
};
export type UpgradePlanner = {
  key: 'upgrade_planner';
  generation: number;
  label: string;
  description: string;
  icons: { index: number; signal: Sig }[];
  mappers: { index: number; from: { type: Index.Types; name: string }; to: { type: Index.Types; name: string } }[];
};

export function isBlueprint(entry: BlueprintEntry): entry is Blueprint {
  return entry?.key === 'blueprint';
}
export function isBlueprintBook(entry: BlueprintEntry): entry is BlueprintBook {
  return entry?.key === 'blueprint_book';
}
export function isDeconstructionItem(entry: BlueprintEntry): entry is DeconstructionPlanner {
  return entry?.key === 'deconstruction_planner';
}
export function isUpgradeItem(entry: BlueprintEntry): entry is UpgradePlanner {
  return entry?.key === 'upgrade_planner';
}
export function isEmpty(entry: BlueprintEntry): entry is null {
  return entry === null;
}
