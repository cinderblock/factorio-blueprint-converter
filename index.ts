import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

// cSpell:ignore Factorio

// For debugging
const CheckForUnlikelyStrings = true;

const factorioDir = process.env.APPDATA + '/Factorio';

export function getBlueprintLocation(v2 = true) {
  return `${factorioDir}/blueprint-storage${v2 ? '-2' : ''}.dat`;
}

type BlueprintData = {
  version: Version;

  expansions: Record<string, string[]>;
  blueprints: (BlueprintEntry | null)[];

  generationCounter: number;
  saveTime: Date;
};

type Version = {
  major: number;
  minor: number;
  patch: number;
  developer: number;
};

type Types = 'ITEM' | 'FLUID' | 'VSIGNAL' | 'TILE' | 'ENTITY' | 'RECIPE' | 'EQUIPMENT' | 'QUALITY' | 'PLANET';

const index: Record<Types, Entry[]> = {
  ITEM: [],
  FLUID: [],
  VSIGNAL: [],
  TILE: [],
  ENTITY: [],
  RECIPE: [],
  EQUIPMENT: [],
  QUALITY: [],
  PLANET: [],
};

/**
 * A class to read a buffer in a stream-ish way
 *
 * read* methods will read the buffer and move the index
 * peak* methods will read the buffer but not move the index
 *
 * *Number methods will read a number of bytes and return the value as a LE number
 * *Count methods read a byte to determine the length of the number to read and then read that number
 *
 */
class BufferReader {
  index: number;

  constructor(private buffer: Buffer) {
    this.index = 0;
  }

  private _advance(length: number) {
    this.index += length;
  }

  skip(length: number) {
    this._advance(length);
  }

  peakNumber(length: number, offset = 0) {
    return this.buffer.readUIntLE(this.index + offset, length);
  }

  readNumber(length: number) {
    const value = this.peakNumber(length);
    this._advance(length);
    return value;
  }

  readBoolean() {
    const v = this.readNumber(1);
    if (v === 0) {
      return false;
    } else if (v === 1) {
      return true;
    }
    throw new Error(`Unexpected boolean value ${v}`);
  }

  readCount(special = false) {
    const length = this.readNumber(1);
    if (length === 255) {
      if (special) {
        // corresponds to count8() from the python implementation
        throw new Error(`Unexpected flexible length 0xff at ${this.index - 1}`);
      }
      return this.readNumber(4);
    }
    return this.readNumber(length);
  }

  readString() {
    const length = this.readNumber(1);
    if (length === 255) {
      throw new Error(`Unexpected length 0xff for String at ${this.index - 1}`);
    }
    const value = this.buffer.toString('utf8', this.index, this.index + length);

    if (CheckForUnlikelyStrings && !/^[\x20-\x7E]*$/.test(value)) {
      console.log(this.buffer.slice(this.index - 1, this.index + length).toString('hex'));
      throw new Error(`Invalid name ${value}`);
    }

    this._advance(length);
    return value;
  }

  /**
   *
   * @param fn
   * @returns
   */
  readArray<T>(lengthLength: number, fn: (index: number) => T) {
    const length = this.readNumber(lengthLength);
    if (lengthLength === 1 && length === 255) {
      throw new Error(`Unexpected length 0xff for Array at ${this.index - 1}`);
    }
    const arr = [] as T[];
    for (let i = 0; i < length; i++) {
      arr.push(fn.bind(this)(i));
    }
    return arr;
  }

  readMappedNumber<T>(length: number, a: T[]) {
    const index = this.readNumber(length);
    if (index >= a.length) {
      throw new Error(`Index ${index} out of range for array of length ${a.length}`);
    }
    return a[index];
  }

  readEntry(type: Types) {
    const id = this.readNumber(type == 'TILE' ? 1 : 2);
    const a = index[type];
    const entry = a.find(e => e.id === id);
    if (!entry) {
      throw new Error(`Entry with id ${id} not found in index`);
    }

    return entry;
  }

  expect(b: Buffer | number[] | number, message: string) {
    if (typeof b == 'number') {
      b = [b];
    }
    if (Array.isArray(b)) {
      b = Buffer.from(b);
    }
    if (b.compare(this.buffer, this.index, this.index + b.length) !== 0) {
      throw new Error(
        `${message}. Expected ${b} at ${this.index} but got ${this.buffer.slice(this.index, this.index + b.length)}`,
      );
    }
    this.index += b.length;
  }
}

function getBlueprints(dat: Buffer) {
  const r = new BufferReader(dat);

  const ret = {
    expansions: {},
  } as BlueprintData;

  // Version
  ret.version = {
    major: r.readNumber(2),
    minor: r.readNumber(2),
    patch: r.readNumber(2),
    developer: r.readNumber(2),
  };

  if (ret.version.major > 2) {
    console.error('Warning: Blueprint version is higher than 2');
  }

  try {
    // Check bool
    r.expect(0, 'Initial bool false check');

    r.readArray(1, () => (ret.expansions[r.readString()] ??= []).push(r.readString()));

    const masterIndex = parseIndex(r, ret);

    // 0x00 0x00
    // 0x3a 0x00 0x00 0x00  | generation counter?
    // 0x47 0xb2 0x6c 0x67  | save time?
    // 0x00 0x00 0x00 0x00  | extra data?
    // 0x01

    // Unknown purpose. Changes
    r.readNumber(1);

    // Unknown purpose. Static
    r.expect(0, '???');

    ret.generationCounter = r.readNumber(4);

    ret.saveTime = timeToDate(r.readNumber(4));

    const extra = r.readNumber(4);

    console.log('extra:', extra);

    // Unknown purpose. Static
    r.expect(1, '???');

    parseLibraryObjects(r, ret);
  } catch (e) {
    console.error(e);
    console.log(`Percent compete: ${((100 * r.index) / dat.length).toFixed(1)}%`);
  }

  return ret;
}

function parseIndex(r: BufferReader, ret: BlueprintData) {
  // 0x41 0x00               | 65 prototypes ?

  // equipment-grid          | first prototype name ?

  // 0x01 0x03               | name count - 769
  // medium-equipment-grid   | category name

  // accumulator             | group name
  // 0x01 0x00               | length
  // 0x4B 0x00               | ID?
  // accumulator             | name

  // arithmetic-combinator
  // 0x01 0x00
  // 0x41 0x00
  // arithmetic-combinator

  // artillery-turret
  // 0x01 0x00
  // 0x7B 0x00
  // artillery-turret

  // assembling-machine
  // 0x01 0x00
  // 0x64 0x00
  // centrifuge

  // beacon
  // 0x01 0x00
  // 0x6C 0x00
  // beacon

  // car
  // 0x01 0x00
  // 0x36 0x00
  // tank

  // cargo-wagon
  // 0x01 0x00
  // 0x32 0x00
  // cargo-wagon

  // ...

  // display-panel
  // 0x01 0x00
  // 0x47 0x00
  // display-panel

  // electric-pole
  // 0x04 0x00
  // 0x1B 0x00
  // small-electric-pole
  // 0x1C 0x00
  // medium-electric-pole
  // 0x1D 0x00
  // big-electric-pole
  // 0x1E 0x00
  // substation

  // electric-turret
  // 0x02 0x00
  // 0x79 0x00
  // laser-turret
  // 0x7D 0x00
  // tesla-turret

  // entity-ghost
  // 0x01 0x00
  // 0x49 0x03
  // entity-ghost

  // half-diagonal-rail
  // 0x01 0x00
  // 0x23 0x00
  // half-diagonal-rail

  // inserter
  // 0x03 0x00
  // 0x16 0x00
  // inserter
  //...

  // 0x3E 0x00
  // up-arrow
  // 0x42 0x00
  // down-arrow
  // 0x4A 0x00
  // signal-item-parameter

  // quality
  // 0x05
  // 0x01
  // normal
  // 0x02
  // uncommon
  // 0x03
  // rare
  // 0x04
  // epic
  // 0x05
  // legendary

  // planet
  // 0x05 0x00
  // 0x01 0x00
  // nauvis
  // 0x02 0x00
  // vulcanus
  // 0x03 0x00
  // gleba
  // 0x04 0x00
  // fulgora
  // 0x05 0x00
  // aquilo

  //   const index = {} as Record<Types, any>;
  let x = 0;

  const indexCount = r.readNumber(2);
  console.log(`indexCount: ${indexCount}`);

  const mainCategory = r.readString();
  console.log('Main Category:', mainCategory);

  // Is this a count or no? It *almost* aligns with the number of groups...
  const firstIndex = r.readNumber(2);
  const firstName = r.readString();

  console.log(firstIndex, firstName);

  for (let j = 1; j < indexCount; j++) {
    const prototype = r.readString();
    // console.log('prototype:', prototype);

    const readNum = prototype == 'quality' ? 1 : 2;
    r.readArray(readNum, () => {
      const id = r.readNumber(readNum);
      const name = r.readString();
      console.log(x++, j, prototype, id, name);

      console.log('type:', typeMap[prototype], prototype);

      index[typeMap[prototype]].push({ prototype, name, id });
    });
  }

  console.log(index);
}

function timeToDate(timestamp: number) {
  return new Date(timestamp * 1000);
}

function parseLibraryObjects(r: BufferReader, ret: BlueprintData) {
  // 0x15 0x00 0x00 0x00        | 21 objects

  // 0x01                       | slot used
  // 0x00                       | prefix
  // 0x12 0x00 0x00 0x00        | generation
  // 0x4d 0x00                  | entry
  // Huge Pumpjacks             | label
  // 0x00                       | expect 0
  // 0x00                       | has removed mods
  // 0xff 0x95 0x01 0x03 0x00   | length (bytes)
  // 0x02 0x00 0x00 0x00 0x1c 0x00 0x01 0x00 0x00 0x0d
  // base
  // 1.1.0.json
  // base
  // 1.2.0 stack inserter rename.json
  // base
  // 2.0.0-biter-egg.json
  // ...
  // space-age
  // tungsten-belt-rename.json
  // 0x 11b6748ffd533648ca1c6800309b8cd7d7ace03c
  // 0x 000000100000560080e080e0200001000000000000006400000000000000000000000000000000000000000000000100
  // 0x 000000000000560000000001200001000000000000006400000000000000000000000000000000000000000000000100
  // 0x 000000000000560000000001200001000000000000006400000000000000000000000000000000000000000000000100
  // 0x 0000000000005600000000...

  ret.blueprints = r.readArray<BlueprintEntry | null>(4, slot => {
    const slotUsed = r.readBoolean();
    if (!slotUsed) {
      console.log(`Slot ${slot} not used`);
      return null;
    }

    console.log('Slot used:', slot);

    const prefix = r.readMappedNumber(1, libraryObjects);

    // console.log('Prefix:', prefix);

    const generation = r.readNumber(4);

    console.log('Generation:', generation);

    const entry = r.readEntry('ITEM');

    console.log('Entry:', entry);

    if (entry.prototype !== prefix.prototype) {
      throw new Error(`Entry ${entry.prototype} does not match prefix ${prefix.prototype}`);
    }

    return {
      key: prefix.key,
      _generation: generation,
      handlerData: prefix.reader(ret.version, r),
    };
  });
}

function parseBlueprint(version: Version, r: BufferReader) {
  const label = r.readString();

  console.log('Label:', label);

  r.expect(0, 'Expect 0');

  const removedMods = r.readBoolean();

  console.log('Removed Mods:', removedMods);

  const length = r.readCount();

  console.log('Length:', length);

  // TODO: Parse data
  r.skip(length);
}

const libraryObjects: {
  key: string;
  prototype: string;
  reader: (version: Version, r: BufferReader) => HandlerData;
}[] = [
  { key: 'blueprint', prototype: 'blueprint', reader: parseBlueprint },
  { key: 'blueprint_book', prototype: 'blueprint-book', reader: 'parse_blueprint_book' },
  { key: 'deconstruction_planner', prototype: 'deconstruction-item', reader: 'parse_deconstruction_item' },
  { key: 'upgrade_planner', prototype: 'upgrade-item', reader: 'parse_upgrade_item' },
];

type HandlerData = any;

type Entry = {
  prototype: string;
  name: string;
  id: number;
};

type BlueprintEntry = {
  key: string;
  _generation: number;
  handlerData: HandlerData;
};

const typeMap: Record<string, Types> = {
  // item
  ammo: 'ITEM',
  armor: 'ITEM',
  blueprint: 'ITEM',
  'blueprint-book': 'ITEM',
  capsule: 'ITEM',
  'deconstruction-item': 'ITEM',
  gun: 'ITEM',
  item: 'ITEM',
  'item-with-entity-data': 'ITEM',
  module: 'ITEM',
  'spidertron-remote': 'ITEM',
  'rail-planner': 'ITEM',
  'repair-tool': 'ITEM',
  tool: 'ITEM',
  'upgrade-item': 'ITEM',
  // item without known ways to put them into blueprints
  'copy-paste-tool': 'ITEM',
  'item-with-label': 'ITEM',
  'item-with-inventory': 'ITEM',
  'item-with-tags': 'ITEM',
  'mining-tool': 'ITEM',
  'selection-tool': 'ITEM',
  // fluid
  fluid: 'FLUID',
  // virtual-signal
  'virtual-signal': 'VSIGNAL',
  // entity
  accumulator: 'ENTITY',
  'ammo-turret': 'ENTITY',
  'arithmetic-combinator': 'ENTITY',
  'artillery-turret': 'ENTITY',
  'artillery-wagon': 'ENTITY',
  'assembling-machine': 'ENTITY',
  beacon: 'ENTITY',
  boiler: 'ENTITY',
  'burner-generator': 'ENTITY',
  'cargo-wagon': 'ENTITY',
  cliff: 'ENTITY',
  'constant-combinator': 'ENTITY',
  container: 'ENTITY',
  'curved-rail': 'ENTITY',
  'decider-combinator': 'ENTITY',
  'electric-energy-interface': 'ENTITY',
  'electric-pole': 'ENTITY',
  'electric-turret': 'ENTITY',
  'entity-ghost': 'ENTITY',
  fish: 'ENTITY',
  'fluid-turret': 'ENTITY',
  'fluid-wagon': 'ENTITY',
  furnace: 'ENTITY',
  gate: 'ENTITY',
  generator: 'ENTITY',
  'heat-interface': 'ENTITY',
  'heat-pipe': 'ENTITY',
  'infinity-container': 'ENTITY',
  'infinity-pipe': 'ENTITY',
  inserter: 'ENTITY',
  'item-entity': 'ENTITY',
  'item-request-proxy': 'ENTITY',
  lab: 'ENTITY',
  lamp: 'ENTITY',
  'land-mine': 'ENTITY',
  'linked-belt': 'ENTITY',
  'linked-container': 'ENTITY',
  loader: 'ENTITY',
  'loader-1x1': 'ENTITY',
  locomotive: 'ENTITY',
  'logistic-container': 'ENTITY',
  'mining-drill': 'ENTITY',
  'offshore-pump': 'ENTITY',
  pipe: 'ENTITY',
  'pipe-to-ground': 'ENTITY',
  'power-switch': 'ENTITY',
  'programmable-speaker': 'ENTITY',
  pump: 'ENTITY',
  radar: 'ENTITY',
  'rail-chain-signal': 'ENTITY',
  'rail-signal': 'ENTITY',
  reactor: 'ENTITY',
  roboport: 'ENTITY',
  'rocket-silo': 'ENTITY',
  'simple-entity': 'ENTITY',
  'solar-panel': 'ENTITY',
  splitter: 'ENTITY',
  'storage-tank': 'ENTITY',
  'straight-rail': 'ENTITY',
  'tile-ghost': 'ENTITY',
  'train-stop': 'ENTITY',
  'transport-belt': 'ENTITY',
  tree: 'ENTITY',
  'underground-belt': 'ENTITY',
  wall: 'ENTITY',
  // tile
  tile: 'TILE',
  // recipe
  recipe: 'RECIPE',
  // special
  'flying-text': 'ENTITY', // no handler (yet), used for "unknown-entity" in upgrade- and deconstruction plans

  // new guesses in 2.0
  car: 'ENTITY',
  'curved-rail-a': 'ENTITY',
  'curved-rail-b': 'ENTITY',
  'display-panel': 'ENTITY',
  'half-diagonal-rail': 'ENTITY',
  'selector-combinator': 'ENTITY',

  'active-defense-equipment': 'EQUIPMENT',
  'battery-equipment': 'EQUIPMENT',
  'energy-shield-equipment': 'EQUIPMENT',
  'equipment-ghost': 'EQUIPMENT',
  'generator-equipment': 'EQUIPMENT',
  'movement-bonus-equipment': 'EQUIPMENT',
  'roboport-equipment': 'EQUIPMENT',
  'solar-panel-equipment': 'EQUIPMENT',
  quality: 'QUALITY',
  planet: 'PLANET',
};

async function main() {
  const blueprintLocation = getBlueprintLocation();

  const blueprints = await readFile(blueprintLocation).then(getBlueprints);

  console.log(blueprints);
}

if (require.main === module) {
  main();
}
