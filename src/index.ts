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
  Version,
} from './BlueprintData.js';
import { typeMap } from './typeMap.js';
import { FactorioBadStringRegex } from './util/FactorioBadStringRegex.js';
import { timeToString } from '../test/helpers/timeToString.js';

// For debugging
const CheckForUnlikelyStrings = true;

export interface Annotation {
  // mark next read as not to be printed
  peek(): void;
  pushLabel(label: string): void;
  clearLabel(label: string): void;
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
    annotation?.clearLabel(label);
    return ret;
  }

  // Wait for the stream to be readable
  async function readable(): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.once('readable', () => {
        stream.off('error', reject);
        stream.off('end', reject);
        resolve();
      });
      stream.once('error', reject);
      stream.once('end', reject);
    });
  }

  await readable();

  let fileLocation = 0;

  // Read a number of bytes from the stream and return it as a Buffer
  async function read(length: number) {
    if (length < 0) throw new Error(`Can't read negative (${length}) bytes`);
    // Node.js limit is 1GiB
    if (length > 2 ** 30) throw new Error(`Reading ${length} bytes is too large`);

    const chunks: Buffer[] = [];
    let bytesRead = 0;

    while (bytesRead < length) {
      if (!stream.readableLength && chunks.length) {
        throw new Error(`Stream ended after reading ${bytesRead} of ${length} bytes`);
      }
      const chunk = stream.read(Math.min(stream.readableLength, length - bytesRead)) as Buffer | null;

      if (chunk === null) {
        if (stream.readableEnded) {
          throw new Error(`Stream ended after reading ${bytesRead} of ${length} bytes`);
        }
        await readable();
        continue;
      }

      bytesRead += chunk.length;
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

  void peek; // make eslint happy

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
  async function readNumberLow(length: 8 | -8): Promise<bigint>;
  /**
   * Read a number of bytes from the stream and return it as a number
   * @param length The number of bytes to read. Can be negative to read a signed number
   */
  async function readNumberLow(length: number): Promise<number>;
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
    let date: Date;

    // This matches exactly the version that is tested for in the original code, but 1.2.0 doesn't exist (at least not publicly)
    // Effectively, this is v2 and later
    const lastVersionThatUsed4ByteDate = new Version('1.2.0', 0x175);

    if (ret.version.compare(lastVersionThatUsed4ByteDate) <= 0) {
      date = new Date((await readNumberLow(4)) * 1000);
    } else {
      const seconds = (await readNumberLow(8)) * 1000n;

      const num = Number(seconds);

      // Cast the number back to a bigint to check if we've lost precision
      if (seconds !== BigInt(num)) {
        throw new Error(`Timestamp ${seconds} is too large`);
      }

      date = new Date(num);
    }

    annotation?.decoded(timeToString(date));

    return date;
  }

  async function readString() {
    const length = await wrapLabel('str-length', () => readNumber(0));

    const buff = await wrapLabel('str', () => read(length));
    const value = buff.toString('utf8');

    // Escape unprintable characters for annotation display
    const escapedValue = value.replace(/[^\x20-\x7E]/g, char => {
      if (char === '\n') return '\\n';
      if (char === '\r') return '\\r';
      if (char === '\t') return '\\t';
      return `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
    });
    annotation?.decoded(escapedValue);

    if (CheckForUnlikelyStrings && FactorioBadStringRegex.test(value)) {
      // console.log(buff.toString('hex'));
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
    return await wrapLabel('LibObj', () =>
      readArray<BlueprintEntry>(4, async () => {
        const slotUsed = await wrapLabel('slot-used', readBoolean);
        annotation?.decoded(slotUsed ? 'used' : 'not used');

        if (!slotUsed) return null;

        const parser = await wrapLabel('entity-type', () =>
          readMappedNumber(1, [parseBlueprint, parseBlueprintBook, parseDeconstructionItem, parseUpgradeItem]),
        );

        annotation?.decoded(parser.name + '()');

        return parser();
      }),
    );
  }

  async function parseBlueprintEntityHeader(prototype: string) {
    return wrapLabel('header', async () => {
      const generation = await wrapLabel('generation', () => readNumber(4));

      const entry = await wrapLabel('entry', () => readEntry('ITEM'));

      if (!entry) {
        throw new Error('Entry not found');
      }

      if (entry.prototype !== prototype) {
        throw new Error(`Entry ${entry.prototype} does not match ${prototype}`);
      }

      const label = await wrapLabel('label', readString);

      return { generation, entry, label };
    });
  }

  async function parseBlueprint(): Promise<Blueprint> {
    annotation?.pushLabel('Blueprint');

    const header = await parseBlueprintEntityHeader('blueprint');

    await expect(0, 'Expect 0');

    const removedMods = await wrapLabel('removed mods', readBoolean);

    const length = await wrapLabel('DataLength', () => readNumber());

    const data = await wrapLabel('UnparsedData', () => read(length));

    annotation?.clearLabel('Blueprint');

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
    annotation?.pushLabel(`readFilters(${type})`);

    const unknowns: Record<number, string> = {};

    await wrapLabel('unknowns', async () =>
      readArray(1, async () => {
        const index = await wrapLabel('index', () => readNumber(2));

        const name = await wrapLabel('name', readString);

        unknowns[index] = name;
      }),
    );

    const filters: {
      // zero based
      index: number;
      name: string;
    }[] = [];

    await wrapLabel('Filters', () =>
      readArray(1, async index => {
        let name = (await wrapLabel('UnknownEntry', () => readEntry(type)))?.name;
        if (!name) return;

        const unknownReplacement = unknowns[index];
        if (unknownReplacement) {
          name = unknownReplacement;
        }

        filters.push({ index, name });
      }),
    );

    const quality: {
      index: number;
      name: string;
    }[] = [];

    if (ret.version.major >= 2) {
      await wrapLabel('Quality', () =>
        readArray(1, async () => {
          const index = await wrapLabel('index', () => readNumber(2));
          const name = await wrapLabel('name', () => readString());
          quality.push({ index, name });
        }),
      );
    }

    annotation?.clearLabel(`readFilters(${type})`);

    return { filters, quality };
  }

  async function parseDeconstructionItem(): Promise<DeconstructionPlanner> {
    annotation?.pushLabel('Decon');

    const header = await parseBlueprintEntityHeader('deconstruction-item');
    const description = await wrapLabel('description', readString);
    const icons = await parseIcons();

    const entityFilterMode = await wrapLabel('EFMode', () => readNumber(1));
    const entityFilters = await wrapLabel('EF', () => readFilters('ENTITY'));
    const treesRocksOnly = await wrapLabel('TROnly', readBoolean);

    const tileFilterMode = await wrapLabel('TFMode', () => readNumber(1));
    const tileSelectionMode = await wrapLabel('TSMode', () => readNumber(1));
    const tileFilters = await wrapLabel('TF', () => readFilters('TILE'));

    annotation?.clearLabel('Decon');

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
    annotation?.pushLabel('UpgradeItem');

    const header = await parseBlueprintEntityHeader('upgrade-item');

    const description = await wrapLabel('description', readString);

    const icons = await parseIcons();

    const unknownFrom: Record<number, string> = {};
    const unknownTo: Record<number, string> = {};

    await wrapLabel('unknowns', () =>
      readArray(1, async () => {
        const name = await wrapLabel('name', readString);
        const isTo = await wrapLabel('isTo', readBoolean);
        const index = await wrapLabel('index', () => readNumber(2));
        (isTo ? unknownTo : unknownFrom)[index] = name;
      }),
    );

    async function reader(unknowns: Record<number, string>): Promise<{
      type: Index.Types;
      name: string;
    }> {
      const isItem = await wrapLabel('isItem', readBoolean);
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

    annotation?.clearLabel('UpgradeItem');

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
    annotation?.pushLabel('BB');
    const { label, generation } = await parseBlueprintEntityHeader('blueprint-book');

    const description = await wrapLabel('description', readString);

    const icons = await parseIcons();

    const blueprints = await parseLibraryObjects();

    const activeIndex = await wrapLabel('activeIndex', () => readNumber(2));

    annotation?.clearLabel('BB');

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
  ret.version = await wrapLabel('version', async () => {
    const ret = new Version();
    ret.major = await wrapLabel('major', () => readNumber(2));
    ret.minor = await wrapLabel('minor', () => readNumber(2));
    ret.patch = await wrapLabel('patch', () => readNumber(2));
    ret.developer = await wrapLabel('developer', () => readNumber(2));
    return ret;
  });

  if (ret.version.major > 2) {
    console.error('Warning: Blueprint major version is greater than 2');
  }

  if (ret.version.compare('1.0.0') <= 0) {
    throw new Error('Blueprint version is less than or equal to 1.0.0');
  }

  ret.version.branch = await wrapLabel('branchVersion', () => readNumber(1));

  // Read expansions
  await wrapLabel('expansions', async () =>
    readArray(1, async () =>
      (ret.expansions[await wrapLabel('game', readString)] ??= []).push(await wrapLabel('file', readString)),
    ),
  );

  await wrapLabel('IndexSize', () =>
    readArray(2, async () => {
      const prototype = await wrapLabel('Prototype', () => readString());

      const readNum = prototype == 'quality' ? 1 : 2;
      await readArray(readNum, async i =>
        wrapLabel(`[${i.toString().padStart(2)}]`, async () => {
          const id = await wrapLabel('id', () => readNumber(readNum));
          const name = await wrapLabel('name', () => readString());

          index[typeMap[prototype]].push({ prototype, name, id });
        }),
      );
    }),
  );

  ret.playerIndex = await wrapLabel('playerIndex', () => readNumber(2));

  // aka `nextRecordID`
  ret.generationCounter = await wrapLabel('generationCounter', () => readNumber(4));

  ret.saveTime = await wrapLabel('saveTime', () => readDate());

  const synchronized = await wrapLabel('synchronized', readBoolean);
  if (!synchronized) {
    // Unknown purpose
    throw new Error('Unsynchronized blueprints are not (yet?) supported');
  }

  ret.blueprints = await parseLibraryObjects();

  // TODO: match MapDeserialiser::loadLoadHelpers

  // TODO: match WireConnectorDeserialiser::loadAllWireConnections

  const versionSplit = new Version('1.2.0', 0xa7);
  if (ret.version.compare(versionSplit) >= 0) {
    if (ret.version.compare(versionSplit) > 0) {
      const savedTargetablesCount = await wrapLabel('savedTargetablesCount', () => readNumber());
      if (savedTargetablesCount !== 0) {
        throw new Error(`savedTargetablesCount is ${savedTargetablesCount}. Not yet implemented.`);
      }
    }

    const targeterToTargetableMapping = await readArray(0, () => readNumber(4));
    if (targeterToTargetableMapping.length !== 0) {
      throw new Error(`targeterToTargetableMapping is ${targeterToTargetableMapping.length}. Not yet implemented.`);
    }

    await expect(0, 'v2-Unknown2');
  }

  //////// Done Parsing ////////

  // Read remaining data with timeout (there shouldn't be any)
  const remainingData = await Promise.race([
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.resume();
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout reading remaining data')), 100)),
  ]);

  if (remainingData.length > 0) {
    await wrapLabel('RemainingData', () => {
      annotation?.read(remainingData, fileLocation);
    });

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

// cSpell:ignore VSIGNAL decon targetable targetables targeter unsynchronized
