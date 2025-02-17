export type Sig = {
  type: 'ITEM' | 'FLUID' | 'VSIGNAL';
  name: string;
};

export type BlueprintData = {
  version: Version;
  expansions: Record<string, string[]>;
  saveTime: Date;
  generationCounter: number;
  playerIndex: number;
  blueprints: BlueprintEntry[];
};
export class Version {
  major: number;
  minor: number;
  patch: number;
  developer: number;

  set branch(x: number) {
    if (x !== 0) {
      throw new Error('Branch version must be 0');
    }
  }
  get branch() {
    return 0;
  }

  constructor(version?: string, developer?: number) {
    if (!version) {
      this.major = 0;
      this.minor = 0;
      this.patch = 0;
      this.developer = 0;
      return;
    }

    const parts = version.split('.');
    if (parts.length < 3 || parts.length > 4) {
      throw new Error('Invalid version string format. Expected: major.minor.patch[.developer]');
    }

    this.major = parseInt(parts[0]);
    this.minor = parseInt(parts[1]);
    this.patch = parseInt(parts[2]);
    this.developer = parts.length === 4 ? parseInt(parts[3]) : (developer ?? 0);

    if (isNaN(this.major) || isNaN(this.minor) || isNaN(this.patch) || isNaN(this.developer)) {
      throw new Error('Invalid version number format');
    }
  }

  compare(other: Version | string): number {
    if (typeof other === 'string') {
      other = new Version(other);
    }
    if (this.major !== other.major) return this.major - other.major;
    if (this.minor !== other.minor) return this.minor - other.minor;
    if (this.patch !== other.patch) return this.patch - other.patch;
    return this.developer - other.developer;
  }
}
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
  removedMods: boolean;
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

// cSpell:ignore VSIGNAL
