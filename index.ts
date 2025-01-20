import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

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

/**
 * A class to make reading paused streams in blocks easier
 *
 * read* methods will read the buffer and move the index
 * peak* methods will read the buffer but not move the index
 *
 * *Number methods will read a number of bytes and return the value as a LE number
 * *Count methods read a byte to determine the length of the number to read and then read that number
 *
 */
export async function parseBlueprintData(stream: Readable): Promise<BlueprintData> {
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

  async function readable() {
    return new Promise<void>(resolve => stream.once('readable', () => resolve()));
    // .then(() => console.log('Readable'));
  }

  await readable();

  async function read(length: number): Promise<Buffer> {
    if (length < 0) throw new Error(`Can't read negative (${length}) bytes`);
    if (!length) return Buffer.alloc(0);
    // Node.js limit is 1GiB
    if (length > 2 ** 30) throw new Error(`Reading ${length} bytes is too large`);
    if (length > stream.readableLength) throw new Error(`Reading ${length} bytes is too large`);

    let tries = 0;

    let ret: Buffer;
    while ((ret = stream.read(length)) === null) {
      if (!stream.readable) {
        throw new Error(`Unexpected end of stream`);
      }

      await readable();

      if (tries++ > 1000) {
        console.log(`Remaining bytes: ${stream.readableLength}, length: ${length}`);
        throw new Error(`Too many tries`);
      }
    }
    return ret;
  }

  async function skip(length: number) {
    console.log('Skipping:', length);

    while (length > 0) {
      const chunk = stream.read(Math.min(stream.readableLength, length));
      if (chunk === null) {
        await readable();
      } else {
        length -= chunk.length;
      }
    }
  }

  async function skip2(length: number) {
    console.log('Skipping:', length);

    while (length > 0) {
      // This doesn't work :/
      const chunk = await read(Math.min(stream.readableLength, length));
      length -= chunk.length;
    }
  }

  async function peak(length: number): Promise<Buffer> {
    const copy = await read(length);
    stream.unshift(copy);
    return copy;
  }

  /**
   * Read a generic number from the stream
   *
   * Reads one byte. If it is not 0xff, it is returned as a number.
   * If it is 0xff, it reads 4 bytes and returns that as a number.
   */
  async function readNumber(): Promise<number>;
  /**
   * Reads one byte and errors if it is 0xff
   * @param error If true, throw an error if the length is 0xff
   */
  async function readNumber(error: true): Promise<number>;
  /**
   * Read a number of bytes from the stream and return it as a number
   * @param length The number of bytes to read. Can be negative to read a signed number
   */
  async function readNumber(length: number): Promise<number>;
  async function readNumber(length: 8 | -8): Promise<bigint>;
  async function readNumber(length: number | true = 0) {
    // TODO: remove this case?
    if (length === true) {
      length = await readNumber(1);
      if (length !== 255) return length;
      throw new Error(`Unexpected flexible length 0xff`);
    }

    if (length === 0) {
      length = await readNumber(1);
      if (length !== 255) return length;
      return await readNumber(4);
    }

    let signed = false;

    if (length < 0) {
      length = -length;
      signed = true;
    }

    if (length > 8) throw new Error(`Reading ${length} bytes is too large`);

    const data = await read(length);

    if (length > 6) {
      if (length === 8) {
        if (signed) return data.readBigInt64LE(0);
        return data.readBigUInt64LE(0);
      }
      throw new Error(`Can't read ${length} bytes as a number`);
    }

    if (signed) return data.readIntLE(0, length);

    return data.readUIntLE(0, length);
  }

  async function readBoolean() {
    const v = await readNumber(1);
    if (v === 0) {
      return false;
    } else if (v === 1) {
      return true;
    }
    throw new Error(`Unexpected boolean value ${v}`);
  }

  async function readDate() {
    return new Date((await readNumber(4)) * 1000);
  }

  async function readString() {
    const length = await readNumber();

    const buff = await read(length);
    const value = buff.toString('utf8');

    if (CheckForUnlikelyStrings && !/^[\x20-\x7E]*$/.test(value)) {
      console.log(buff.toString('hex'));
      throw new Error(`Invalid name ${value}`);
    }

    return value;
  }

  async function readArray<T>(lengthLength: number, fn: (index: number) => Promise<T>) {
    // Maybe this should be a readNumber() call?
    const length = await readNumber(lengthLength);
    if (lengthLength === 1 && length === 255) {
      throw new Error(`Unexpected length 0xff for Array`);
    }

    console.log('Reading array of length:', length);

    const arr = [] as T[];
    for (let i = 0; i < length; i++) {
      arr.push(await fn(i));
    }
    return arr;
  }

  /**
   * Selects an entry from an array based on a number read from the stream
   * @param length Length of number to read
   * @param a Array to read from
   * @returns The selected entry
   */
  async function readMappedNumber<T>(length: number, a: T[]) {
    const index = await readNumber(length);
    if (index >= a.length) {
      throw new Error(`Index ${index} out of range for array of length ${a.length}`);
    }
    return a[index];
  }

  async function readEntry(type: Types) {
    const id = await readNumber(type == 'TILE' ? 1 : 2);
    const a = index[type];
    const entry = a.find(e => e.id === id);
    if (!entry) {
      //   throw new Error(`Entry with id ${id} not found in index`);
    }

    return entry;
  }

  async function expect(b: Buffer | number[] | number, message: string) {
    if (typeof b == 'number') {
      b = [b];
    }
    if (Array.isArray(b)) {
      b = Buffer.from(b);
    }

    if (b.compare(await read(b.length)) !== 0) {
      throw new Error(`${message}. Expected ${b.toString('hex')}`);
    }
  }

  type Sig = { name: string; type: 'ITEM' | 'FLUID' | 'VSIGNAL' };

  async function readSignal(): Promise<Sig | null> {
    const type = await readMappedNumber<'ITEM' | 'FLUID' | 'VSIGNAL'>(1, ['ITEM', 'FLUID', 'VSIGNAL']);
    const entry = await readEntry(type);

    if (!entry) return null;

    return {
      type,
      name: entry.name,
    };
  }

  async function parseIcons() {
    const unknownIcons = await readArray(1, readString);

    const icons: {
      index: number;
      signal: Sig;
    }[] = [];

    await readArray(1, async i => {
      const signal = await readSignal();
      if (!signal) {
        console.log(`Icon ${i} not found`);
        return;
      }
      if (unknownIcons[i]) {
        signal.name = unknownIcons[i];
      }
      icons.push({
        // 1-based index
        index: i + 1,
        signal,
      });
    });

    return icons;
  }

  async function parseLibraryObjects(): Promise<(BlueprintEntry | null)[]> {
    // 0x15 0x00 0x00 0x00        | 21 objects

    // 0x01                       | slot used
    // 0x00                       | prefix
    // 0x12 0x00 0x00 0x00        | generation
    // 0x4d 0x00                  | entry

    return readArray<BlueprintEntry | null>(4, async slot => {
      const slotUsed = await readBoolean();
      if (!slotUsed) {
        console.log(`Slot ${slot} not used`);
        return null;
      }

      console.log('Slot used:', slot);

      const libraryObjects: {
        key: string;
        prototype: string;
        reader: () => Promise<HandlerData>;
      }[] = [
        { key: 'blueprint', prototype: 'blueprint', reader: parseBlueprint },
        { key: 'blueprint_book', prototype: 'blueprint-book', reader: parseBlueprintBook },
        { key: 'deconstruction_planner', prototype: 'deconstruction-item', reader: parseDeconstructionItem },
        { key: 'upgrade_planner', prototype: 'upgrade-item', reader: parseUpgradeItem },
      ];

      const prefix = await readMappedNumber(1, libraryObjects);

      // console.log('Prefix:', prefix);

      const generation = await readNumber(4);

      console.log('Generation:', generation);

      const entry = await readEntry('ITEM');

      if (!entry) {
        throw new Error('Entry not found');
      }

      console.log('Entry:', entry.name);

      if (entry.prototype !== prefix.prototype) {
        throw new Error(`Entry ${entry.prototype} does not match prefix ${prefix.prototype}`);
      }

      return {
        key: prefix.key,
        _generation: generation,
        handlerData: await prefix.reader(),
      };
    });
  }

  async function parseBlueprint() {
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

    const label = await readString();

    console.log('Blueprint:', label);

    await expect(0, 'Expect 0');

    const removedMods = await readBoolean();

    const length = await readNumber();

    // TODO: Parse data
    await skip(length);
    console.log('Data:', '...');
  }
  async function readFilters(sectionName, type: Types) {
    const unknowns: Record<number, string> = {};

    console.log('Peak:', (await peak(100)).toString('hex'));

    console.log('reading unknowns');
    await readArray(1, async () => {
      const index = await readNumber(2);
      const name = await readString();
      unknowns[index] = name;
    });

    const filters: {
      // zero based
      index: number;
      name: string;
    }[] = [];

    console.log('Peak:', (await peak(100)).toString('hex'));

    console.log('reading filters');
    await readArray(1, async index => {
      let name = (
        await readEntry(type).catch(e => {
          console.log("warning: couldn't read entry", type, e.message);
        })
      )?.name;
      //   let name = await readString();
      //   console.log('Name:', name);
      if (!name) return;

      const unknownReplacement = unknowns[index];
      if (unknownReplacement) {
        console.log('Replacing name');
        name = unknownReplacement;
      }

      filters.push({ index, name });
    });

    throw new Error('Not finished');

    return filters;
  }

  async function parseDeconstructionItem() {
    /* Example Data: Empty planner
       054c6162656c0444657363000000001e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001023b0000004e00

       054c6162656c | Label
       0444657363   | Desc
       00           | Icon count (array)
       00           | Entity Filter Mode
       00           | entity filter unknowns (array)
       00           | entity filters (array)
       1e
       000000000000000000000000000000000000000000000000000000000000
       000000000000000000000000000000000000000000000000000000000000
       000000000000000000000000000000000000000000000000000000000000
       
       00000000
       1e
       000000000000000000000000000000000000000000000000000000000000
       000000000000000000000000000000000000000000000000000000000000
       01023b0000004e00
     */

    /* Example Data: Empty, trees only planner
       0b4465636f6e2054726565730a54726565656565656573000000001e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000001e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100090000004d00000000ffc5070000020000001c00010000

       0b4465636f6e205472656573 | Decon Trees
       0a54726565656565656573   | Treeeeeees
       00
       00
       00
       00
       1e
       000000000000000000000000000000000000000000000000000000000000
       000000000000000000000000000000000000000000000000000000000000
       000000000000000000000000000000000000000000000000000000000000
       01000000
       1e
       000000000000000000000000000000000000000000000000000000000000
       000000000000000000000000000000000000000000000000000000000000
       0100090000004d00000000ffc5070000020000001c00010000
    */

    /* Example Data: Random planner
      0b4465636f6e204c6162656c0f4465636f6e73747563742044657363000000001e79000102740001021b0001027b0001027d000102000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002001e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001020f0000004e000000000000001e36000102490301023f0101024101010242010102000000000000000000000000000000590301020000003c000102000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002001e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001011e000000500004477269640000000400000001001f0000004d00 (might have some extra data)


      0b4465636f6e204c6162656c         | Decon Label
      0f4465636f6e73747563742044657363 | Deconstuct Desc
      00                               | parseIcons().unknownIcons (array of strings)
      00                               | parseIcons().icons (array of Signals (type and entity))
      00                               | entityFilterMode
      00                               | entityFilter = readFilters().unknowns (array of (index,strings))
      1e                               | entityfilters (array of Entities)
      79000102740001021b0001027b0001027d00010200000000000000000000
      000000000000000000000000000000000000000000000000000000000000
      000000000000000000000000000000000000000000000000000000000000
      000000000000000200
      1e
      000000000000000000000000000000000000000000000000000000000000
      000000000000000000000000000000000000000000000000000000000000
      01020f0000004e00000000000000
      1e
      36000102490301023f0101024101010242010102000000000000000000000000000000590301020000003c00010200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200
      1e
      000000000000000000000000000000000000000000000000000000000000
      000000000000000000000000000000000000000000000000000000000000
      000101
      1e000000500004477269640000000400000001001f0000004d00 (might have some extra data)
      
     */
    const exampleData = await peak(200);
    console.log('Example Data:', exampleData.toString('hex'));

    const label = await readString();

    console.log('Deconstruction Planner:', label);

    const description = await readString();

    console.log('Deconstruction Planner Desc:', description);

    console.log('Peak:', (await peak(100)).toString('hex'));

    const icons = await parseIcons();

    console.log('Icons:', icons);

    // console.log((await read(100)).toString('hex'));
    // throw new Error('Not implemented');

    console.log('Peak:', (await peak(100)).toString('hex'));

    const entityFilterMode = await readNumber(1);

    console.log('Entity Filter Mode:', entityFilterMode);

    console.log('Peak:', (await peak(100)).toString('hex'));

    const entityFilters = await readFilters('entity', 'ENTITY');

    console.log('Entity Filters:', entityFilters);

    console.log('Peak:', (await peak(100)).toString('hex'));

    const treesRocksOnly = await readBoolean();

    console.log('Trees/Rocks Only:', treesRocksOnly);

    console.log('Peak:', (await peak(100)).toString('hex'));

    const tileFilterMode = await readNumber(1);

    const tileSelectionMode = await readNumber(1);

    const tileFilters = await readFilters('tile', 'TILE');

    throw new Error('Not finished');
  }

  async function parseUpgradeItem() {
    const label = await readString();

    console.log('Upgrade Planner:', label);

    const description = await readString();

    const icons = await parseIcons();

    const unknownFrom: Record<number, string> = {};
    const unknownTo: Record<number, string> = {};

    await readArray(1, async () => {
      const name = await readString();
      const isTo = await readBoolean();
      const index = await readNumber(2);
      (isTo ? unknownTo : unknownFrom)[index] = name;
    });

    async function reader(unknowns: Record<number, string>): Promise<{
      type: Types;
      name: string;
    }> {
      const isItem = await readBoolean();
      const entry = await readEntry(isItem ? 'ITEM' : 'ENTITY');

      if (!entry) {
        throw new Error('Unknown entry');
      }

      const { name } = entry;
      if (!name) {
        throw new Error('Unknown name');
      }

      // unknown_replacement = unknowns.get(m)
      //   if unknown_replacement:
      //     name = unknown_replacement

      return { type: isItem ? 'ITEM' : 'ENTITY', name };
    }

    const mappers: {
      index: number;
      from: { type: Types; name: string };
      to: { type: Types; name: string };
    }[] = [];

    await readArray(1, async index => {
      const from = await reader(unknownFrom);
      const to = await reader(unknownTo);
      if (from || to) {
        mappers.push({ index, from, to });
      }
    });
  }

  async function parseBlueprintBook() {
    const label = await readString();

    console.log('Blueprint Book:', label);

    const description = await readString();

    console.log('Description:', description);

    const icons = await parseIcons();

    const objects = await parseLibraryObjects();

    const activeIndex = await readNumber(1);

    await expect(0, 'Expect 0');
  }

  const ret = {
    expansions: {},
  } as BlueprintData;

  /////// Start reading data ///////

  //   console.log('Start block: ' + (await peak(10)).toString('hex'));

  // See: https://wiki.factorio.com/Version_string_format
  ret.version = {
    major: await readNumber(2),
    minor: await readNumber(2),
    patch: await readNumber(2),
    developer: await readNumber(2),
  };

  if (ret.version.major > 2) {
    console.error('Warning: Blueprint version is higher than 2');
  }

  try {
    // Check bool
    await expect(0, 'Initial bool false check');

    // Read expansions
    await readArray(1, async () => (ret.expansions[await readString()] ??= []).push(await readString()));

    // Fill Index
    {
      /** Example data
        0x41 0x00               | 65 prototypes ?

        equipment-grid          | first prototype name ?

        0x01 0x03               | name count - 769
        medium-equipment-grid   | category name

        accumulator             | group name
        0x01 0x00               | length
        0x4B 0x00               | ID?
        accumulator             | name

        arithmetic-combinator
        0x01 0x00
        0x41 0x00
        arithmetic-combinator

        artillery-turret
        0x01 0x00
        0x7B 0x00
        artillery-turret

        assembling-machine
        0x01 0x00
        0x64 0x00
        centrifuge

        beacon
        0x01 0x00
        0x6C 0x00
        beacon

        car
        0x01 0x00
        0x36 0x00
        tank

        cargo-wagon
        0x01 0x00
        0x32 0x00
        cargo-wagon

        ...

        display-panel
        0x01 0x00
        0x47 0x00
        display-panel

        electric-pole
        0x04 0x00
        0x1B 0x00
        small-electric-pole
        0x1C 0x00
        medium-electric-pole
        0x1D 0x00
        big-electric-pole
        0x1E 0x00
        substation

        electric-turret
        0x02 0x00
        0x79 0x00
        laser-turret
        0x7D 0x00
        tesla-turret

        entity-ghost
        0x01 0x00
        0x49 0x03
        entity-ghost

        half-diagonal-rail
        0x01 0x00
        0x23 0x00
        half-diagonal-rail

        inserter
        0x03 0x00
        0x16 0x00
        inserter
        //...

        0x3E 0x00
        up-arrow
        0x42 0x00
        down-arrow
        0x4A 0x00
        signal-item-parameter

        quality
        0x05
        0x01
        normal
        0x02
        uncommon
        0x03
        rare
        0x04
        epic
        0x05
        legendary

        planet
        0x05 0x00
        0x01 0x00
        nauvis
        0x02 0x00
        vulcanus
        0x03 0x00
        gleba
        0x04 0x00
        fulgora
        0x05 0x00
        aquilo
        // */

      //   const index = {} as Record<Types, any>;
      let x = 0;

      const indexCount = await readNumber(2);
      console.log(`indexCount: ${indexCount}`);

      const mainCategory = await readString();
      console.log('Main Category:', mainCategory);

      // Is this a count or no? It *almost* aligns with the number of groups...
      const firstIndex = await readNumber(2);
      const firstName = await readString();

      console.log(firstIndex, firstName);

      for (let j = 1; j < indexCount; j++) {
        const prototype = await readString();
        // console.log('prototype:', prototype);

        const readNum = prototype == 'quality' ? 1 : 2;
        await readArray(readNum, async () => {
          const id = await readNumber(readNum);
          const name = await readString();
          console.log(x++, j, prototype, id, name);

          console.log('type:', typeMap[prototype], prototype);

          index[typeMap[prototype]].push({ prototype, name, id });
        });
      }

      console.log(index);
    }

    /* Example data

       0x00
       0x00
       0x3a 0x00 0x00 0x00  | generation counter?
       0x47 0xb2 0x6c 0x67  | save time?
       0x00 0x00 0x00 0x00  | extra data? New in 2.0?
       0x01
    // */

    // Unknown purpose. Changes
    await readNumber(1);

    // Unknown purpose. Static
    await expect(0, '???');

    ret.generationCounter = await readNumber(4);

    ret.saveTime = await readDate();

    const extra = await readNumber(4);

    console.log('extra:', extra);

    // Unknown purpose. Static
    await expect(1, '???');

    ret.blueprints = await parseLibraryObjects();

    console.log('Done');

    console.log('Remaining:', stream.readableLength);
  } catch (e) {
    console.error(e);
  }

  return ret;
}

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

  const blueprintData = await parseBlueprintData(createReadStream(blueprintLocation));

  console.log(blueprintData);
}

if (require.main === module) {
  main();
}
