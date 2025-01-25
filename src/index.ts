import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import esMain from 'es-main';
import { getBlueprintLocation } from './util/getBlueprintLocation.js';
import {
  BlueprintData,
  Index,
  BlueprintEntry,
  Blueprint,
  DeconstructionPlanner,
  UpgradePlanner,
  BlueprintBook,
  Sig,
} from './BlueprintData.js';
import { typeMap } from './typeMap.js';

// For debugging
const CheckForUnlikelyStrings = true;

export interface Annotation {
  // mark next read as not to be printed
  peek(): void;
  pushLabel(label: string): void;
  popLabel(): void;
  read(buffer: Buffer, location: number): void;
  decoded(v: string): void;
}

export async function parseBlueprintData(stream: Readable, annotation?: Annotation): Promise<BlueprintData> {
  const index: Record<Index.Types, Index.Entry[]> = {
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

  async function wrapLabel<T>(label: string, fn: () => T): Promise<T> {
    annotation?.pushLabel(label);
    const ret = await fn();
    annotation?.popLabel();
    return ret;
  }

  // Wait for the stream to be readable
  async function readable(): Promise<void> {
    return new Promise(resolve => stream.once('readable', resolve));
  }

  await readable();

  let fileLocation = 0;

  // Read a number of bytes from the stream and return it as a Buffer
  async function read(length: number) {
    if (length < 0) throw new Error(`Can't read negative (${length}) bytes`);
    // Node.js limit is 1GiB
    if (length > 2 ** 30) throw new Error(`Reading ${length} bytes is too large`);

    const chunks: Buffer[] = [];

    while (length > 0) {
      const chunk = stream.read(Math.min(stream.readableLength, length)) as Buffer | null;
      if (chunk === null) {
        await readable();
        continue;
      }

      if (chunk.length > length) {
        throw new Error(`Chunk too large: ${chunk.length} > ${length}`);
      }

      length -= chunk.length;
      chunks.push(chunk);
    }

    const ret = Buffer.concat(chunks);

    annotation?.read(ret, fileLocation);

    fileLocation += ret.length;

    return ret;
  }

  // Read a number of bytes from the stream and return it as a Buffer without moving the stream index
  async function peek(length: number): Promise<Buffer> {
    annotation?.peek();
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
  async function readNumberLow(): Promise<number>;
  async function readNumberLow(length: 0): Promise<number>;
  /**
   * Reads one byte and errors if it is 0xff
   * @param error If true, throw an error if the length is 0xff
   */
  async function readNumberLow(error: true): Promise<number>;
  /**
   * Read a number of bytes from the stream and return it as a number
   * @param length The number of bytes to read. Can be negative to read a signed number
   */
  async function readNumberLow(length: number): Promise<number>;
  async function readNumberLow(length: 8 | -8): Promise<bigint>;
  async function readNumberLow(length: number | true = 0) {
    // TODO: remove this case?
    if (length === true) {
      length = await readNumberLow(1);
      if (length !== 255) return length;
      throw new Error(`Unexpected flexible length 0xff`);
    }

    if (length === 0) {
      length = await readNumberLow(1);
      if (length !== 255) return length;
      return await readNumberLow(4);
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

  /**
   * Read a generic number from the stream
   *
   * Reads one byte. If it is not 0xff, it is returned as a number.
   * If it is 0xff, it reads 4 bytes and returns that as a number.
   */
  async function readNumber(): Promise<number>;
  async function readNumber(length: 0): Promise<number>;
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
  async function readNumber(length: number | true | string | false = 0): Promise<number | bigint> {
    const ret = await readNumberLow(length as number);

    annotation?.decoded(ret.toString());

    return ret;
  }

  async function readBoolean() {
    const v = await readNumberLow(1);
    let ret: boolean;
    if (v === 0) {
      ret = false;
    } else if (v === 1) {
      ret = true;
    } else {
      throw new Error(`Unexpected boolean value ${v}`);
    }

    annotation?.decoded(ret.toString());

    return ret;
  }

  async function readDate() {
    return new Date((await readNumberLow(4)) * 1000);
  }

  async function readString() {
    const length = await readNumber(0);

    const buff = await read(length);
    const value = buff.toString('utf8');

    // Escape unprintable characters for annotation display
    const escapedValue = value.replace(/[^\x20-\x7E]/g, char => {
      if (char === '\n') return '\\n';
      if (char === '\r') return '\\r';
      if (char === '\t') return '\\t';
      return `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
    });
    annotation?.decoded(escapedValue);

    if (CheckForUnlikelyStrings && !/^[\x20-\x7E\r\n\t]*$/.test(value)) {
      console.log(buff.toString('hex'));
      annotation?.decoded('Invalid name');
      throw new Error(`Invalid name ${escapedValue}`);
    }

    return value;
  }

  async function readArray<T>(lengthLength: number, fn: (index: number) => Promise<T>) {
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

  async function readEntry(type: Index.Types) {
    const id = await readNumber(type == 'TILE' ? 1 : 2);
    const a = index[type];
    const entry = a.find(e => e.id === id);
    if (!entry) {
      //   throw new Error(`Entry with id ${id} not found in index`);
    }

    annotation?.decoded(entry?.name ?? 'null');

    return entry;
  }

  async function expect(b: Buffer | number[] | number, message: string) {
    if (typeof b == 'number') {
      b = [b];
    }
    if (Array.isArray(b)) {
      b = Buffer.from(b);
    }

    await wrapLabel(message, async () => {
      if (b.compare(await read(b.length)) !== 0) {
        throw new Error(`${message}. Expected ${b.toString('hex')}`);
      }

      annotation?.decoded(`0x${b.toString('hex')} ✅`);
    });
  }

  async function readSignal(): Promise<Sig | null> {
    return await wrapLabel('signal', async () => {
      const type = await wrapLabel('type', () => readMappedNumber<Sig['type']>(1, ['ITEM', 'FLUID', 'VSIGNAL']));
      annotation?.decoded(type);

      const entry = await wrapLabel('entry', () => readEntry(type));
      annotation?.decoded(entry?.name ?? 'null');

      if (!entry) return null;

      return {
        type,
        name: entry.name,
      };
    });
  }

  async function parseIcons() {
    const unknownIcons = await wrapLabel('unknownIcons', () => readArray(1, readString));

    const icons: {
      index: number;
      signal: Sig;
    }[] = [];

    await wrapLabel('icons', async () => {
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
    });

    return icons;
  }

  async function parseLibraryObjects(): Promise<BlueprintEntry[]> {
    // 0x15 0x00 0x00 0x00        | 21 objects

    // 0x01                       | slot used
    // 0x00                       | prefix
    // 0x12 0x00 0x00 0x00        | generation
    // 0x4d 0x00                  | entry

    return await wrapLabel('library objects', () =>
      readArray<BlueprintEntry>(4, async slot => {
        const slotUsed = await readBoolean();
        annotation?.decoded(slotUsed ? 'used' : 'not used');

        if (!slotUsed) {
          console.log(`Slot ${slot} not used`);
          return null;
        }

        console.log('Slot used:', slot);

        const parse = await readMappedNumber(1, [
          parseBlueprint,
          parseBlueprintBook,
          parseDeconstructionItem,
          parseUpgradeItem,
        ]);

        return parse();
      }),
    );
  }

  async function parseBlueprintEntityHeader(prototype: string) {
    return wrapLabel('header', async () => {
      const generation = await wrapLabel('generation', () => readNumber(4));

      console.log('Generation:', generation);

      const entry = await wrapLabel('entry', () => readEntry('ITEM'));

      if (!entry) {
        throw new Error('Entry not found');
      }

      console.log('Entry:', entry.name);

      if (entry.prototype !== prototype) {
        throw new Error(`Entry ${entry.prototype} does not match ${prototype}`);
      }

      const label = await wrapLabel('label', () => readString());

      console.log('Label:', label);

      return { generation, entry, label };
    });
  }

  async function parseBlueprint(): Promise<Blueprint> {
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

    annotation?.pushLabel('blueprint');

    const header = await parseBlueprintEntityHeader('blueprint');

    // blueprint-book
    // deconstruction-item
    // upgrade-item

    await expect(0, 'Expect 0');

    const removedMods = await wrapLabel('removed mods', () => readBoolean());

    const length = await wrapLabel('data length', () => readNumber(4));

    const data = await wrapLabel('unparsed data', () => read(length));

    annotation?.popLabel(); // blueprint

    return {
      key: 'blueprint',
      generation: header.generation,
      label: header.label,
      description: 'not yet implemented',
      removedMods,
      data,
    };
  }

  async function readFilters(type: Index.Types) {
    annotation?.pushLabel('filters');

    const unknowns: Record<number, string> = {};

    await wrapLabel('unknowns', async () =>
      readArray(1, async () => {
        const index = await wrapLabel('index', () => readNumber(2));

        const name = await wrapLabel('name', () => readString());

        unknowns[index] = name;
      }),
    );

    const filters: {
      // zero based
      index: number;
      name: string;
    }[] = [];

    await wrapLabel('filters', () =>
      readArray(1, async index => {
        let name = (await wrapLabel('unknown entry', () => readEntry(type)))?.name;
        if (!name) return;

        const unknownReplacement = unknowns[index];
        if (unknownReplacement) {
          console.log('Replacing name');
          name = unknownReplacement;
        }

        filters.push({ index, name });
      }),
    );

    const quality: {
      index: number;
      name: string;
    }[] = [];

    await wrapLabel('quality', () =>
      readArray(1, async () => {
        const index = await wrapLabel('index', () => readNumber(2));
        const name = await wrapLabel('name', () => readString());
        quality.push({ index, name });
      }),
    );

    annotation?.popLabel(); // filters

    return { filters, quality };
  }

  async function parseDeconstructionItem(): Promise<DeconstructionPlanner> {
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

    annotation?.pushLabel('deconstruction-item');

    const header = await parseBlueprintEntityHeader('deconstruction-item');

    const description = await wrapLabel('description', () => readString());

    console.log('Deconstruction Planner Desc:', description);

    const icons = await parseIcons();

    // console.log((await read(100)).toString('hex'));

    const entityFilterMode = await wrapLabel('Entity filter mode', () => readNumber(1));

    console.log('Entity Filter Mode:', entityFilterMode);

    const entityFilters = await wrapLabel('entity filters', () => readFilters('ENTITY'));

    console.log('Entity Filters:', entityFilters);

    const treesRocksOnly = await wrapLabel('trees/rocks only', () => readBoolean());

    console.log('Trees/Rocks Only:', treesRocksOnly);

    const tileFilterMode = await wrapLabel('tile filter mode', () => readNumber(1));

    const tileSelectionMode = await wrapLabel('tile selection mode', () => readNumber(1));

    const tileFilters = await wrapLabel('tile filters', () => readFilters('TILE'));

    annotation?.popLabel(); // deconstruction-item

    return {
      key: 'deconstruction_planner',
      generation: header.generation,
      label: header.label,
      description,
      icons,
      entityFilterMode,
      entityFilters,
      treesRocksOnly,
      tileFilterMode,
      tileSelectionMode,
      tileFilters,
    };
  }

  async function parseUpgradeItem(): Promise<UpgradePlanner> {
    annotation?.pushLabel('Upgrade-item');

    const header = await parseBlueprintEntityHeader('upgrade-item');

    const description = await wrapLabel('description', () => readString());

    const icons = await parseIcons();

    const unknownFrom: Record<number, string> = {};
    const unknownTo: Record<number, string> = {};

    await wrapLabel('unknowns', () =>
      readArray(1, async () => {
        const name = await wrapLabel('name', () => readString());
        const isTo = await wrapLabel('isTo', () => readBoolean());
        const index = await wrapLabel('index', () => readNumber(2));
        (isTo ? unknownTo : unknownFrom)[index] = name;
      }),
    );

    async function reader(unknowns: Record<number, string>): Promise<{
      type: Index.Types;
      name: string;
    }> {
      const isItem = await wrapLabel('isItem', () => readBoolean());
      const entry = await wrapLabel('entry', () => readEntry(isItem ? 'ITEM' : 'ENTITY'));

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
      from: { type: Index.Types; name: string };
      to: { type: Index.Types; name: string };
    }[] = [];

    await wrapLabel('mappers', () =>
      readArray(1, async index => {
        const from = await reader(unknownFrom);
        const to = await reader(unknownTo);
        mappers.push({ index, from, to });
      }),
    );

    annotation?.popLabel(); // upgrade-item

    return {
      key: 'upgrade_planner',
      generation: header.generation,
      label: header.label,
      description,
      icons,
      mappers,
    };
  }

  async function parseBlueprintBook(): Promise<BlueprintBook> {
    annotation?.pushLabel('Blueprint Book');
    const { label, generation } = await parseBlueprintEntityHeader('blueprint-book');

    const description = await wrapLabel('description', () => readString());

    console.log('Description:', description);

    const icons = await parseIcons();

    const blueprints = await parseLibraryObjects();

    const activeIndex = await wrapLabel('activeIndex', () => readNumber(1));

    await expect(0, 'Expect 0');

    annotation?.popLabel(); // blueprint-book

    return {
      key: 'blueprint_book',
      generation,
      label,
      description,
      icons,
      blueprints,
      activeIndex,
    };
  }

  const ret = {
    expansions: {},
  } as BlueprintData;

  /////// Start reading data ///////

  // See: https://wiki.factorio.com/Version_string_format
  ret.version = await wrapLabel('version', async () => ({
    major: await wrapLabel('major', () => readNumber(2)),
    minor: await wrapLabel('minor', () => readNumber(2)),
    patch: await wrapLabel('patch', () => readNumber(2)),
    developer: await wrapLabel('developer', () => readNumber(2)),
  }));

  console.log('Version:', ret.version);

  if (ret.version.major > 2) {
    console.error('Warning: Blueprint version is higher than 2');
  }

  // Check bool
  await expect(0, 'Initial bool false check');

  // Read expansions
  await wrapLabel('expansions', async () =>
    readArray(1, async () =>
      (ret.expansions[await wrapLabel('game', readString)] ??= []).push(await wrapLabel('file', readString)),
    ),
  );

  console.log('expansions:', ret.expansions);

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

    const indexCount = await wrapLabel('indexCount', () => readNumber(2));
    console.log(`indexCount: ${indexCount}`);

    const mainCategory = await wrapLabel('mainCategory', readString);
    console.log('Main Category:', mainCategory);

    // Is this a count or no? It *almost* aligns with the number of groups...
    const firstIndex = await wrapLabel('firstIndex', () => readNumber(2));
    const firstName = await wrapLabel('firstName', () => readString());

    console.log(firstIndex, firstName);

    for (let j = 1; j < indexCount; j++) {
      const prototype = await wrapLabel('prototype', () => readString());
      // console.log('prototype:', prototype);

      const readNum = prototype == 'quality' ? 1 : 2;
      await readArray(readNum, async i =>
        wrapLabel(`[${i.toString().padStart(2)}]`, async () => {
          const id = await wrapLabel('id', () => readNumber(readNum));
          const name = await wrapLabel('name', () => readString());

          index[typeMap[prototype]].push({ prototype, name, id });
        }),
      );
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
  await wrapLabel('unknown1', () => readNumber(1));

  // Unknown purpose. Static
  await expect(0, 'Unknown 2');

  ret.generationCounter = await wrapLabel('generationCounter', () => readNumber(4));

  console.log('generationCounter:', ret.generationCounter);

  ret.saveTime = await wrapLabel('saveTime', () => readDate());

  console.log('saveTime:', ret.saveTime);

  const extra = await wrapLabel('extra', () => readNumber(4));

  console.log('extra:', extra);

  // Unknown purpose. Static
  await expect(1, 'Unknown 3');

  ret.blueprints = await parseLibraryObjects();

  console.log('Done');

  // Read remaining data with timeout
  const remainingData = await Promise.race([
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout reading remaining data')), 100)),
  ]);

  const fullLength = fileLocation + remainingData.length;

  if (remainingData.length > 0) {
    console.log(`${remainingData.length} bytes of remaining data!`);
    console.log(`File location: ${fileLocation} (${((100 * fileLocation) / fullLength).toFixed(0)}%)`);

    const printRemainingBytesLines = 10;
    if (printRemainingBytesLines) {
      const groupSize = 2;
      const groupCount = 32;
      const bytesPerLine = groupSize * groupCount;

      for (let line = 0; line < printRemainingBytesLines; line++) {
        const offset = line * bytesPerLine;
        const slice = remainingData.slice(offset, offset + bytesPerLine);

        if (slice.length === 0) break; // Stop if we've run out of data

        let hexLine = '';
        for (let i = 0; i < slice.length; i += groupSize) {
          const hex = slice.slice(i, i + groupSize).toString('hex');
          hexLine += hex + ' ';
        }

        console.log(hexLine);
      }
    }

    throw new Error(`Unexpected ${remainingData.length} bytes remaining in stream`);
  }
  return ret;
}

async function main() {
  const blueprintData = await parseBlueprintData(createReadStream(getBlueprintLocation()));
  console.log(blueprintData);
}

if (esMain(import.meta)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
