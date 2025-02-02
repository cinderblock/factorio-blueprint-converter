import { isUtf8 } from 'node:buffer';
import { FactorioBadStringRegex } from '../../src/util/FactorioBadStringRegex.js';

type SplitResult = { start: number; data: Buffer; string?: string };

/**
 * Find Factorio Strings in a buffer and return the original buffer split into chunks with the strings parsed in an easy to process object format.
 *
 * A Factorio String starts with a Factorio Number, which describes the length of the string.
 *
 * A Factorio Number is a 32-bit, usually unsigned, integer.
 * If it is less than 255, is encoded in a single byte.
 * If it is greater than or equal to 255, it is encoded in a 5 byte sequence, starting with a 0xFF byte, followed by 4 bytes of the number, LE
 *
 * @param buff
 * @returns
 */
export default function findStrings(
  buff: Buffer,
  options: {
    skipOverFoundString?: boolean;
    shortestString?: number;
    longestString?: number;
    badCharacterRegex?: RegExp;
  } = {},
): SplitResult[] {
  const {
    skipOverFoundString = true,
    shortestString = 3,
    longestString = 2000,
    badCharacterRegex = FactorioBadStringRegex,
  } = options;

  const results: SplitResult[] = [];

  let lastUnknown = 0;

  function pushUnknowns(end?: number) {
    const data = buff.subarray(lastUnknown, end);
    if (!data.length) return;

    results.push({ start: lastUnknown, data });
    lastUnknown += data.length;
  }

  function getString(searchLocation: number) {
    let stringBytes = buff[searchLocation];

    let offset = 1;
    if (stringBytes === 0xff) {
      const intBytes = 4;
      // if the buffer can't contain the 4 byte number, skip it
      if (searchLocation + offset + intBytes > buff.length) return null;

      stringBytes = buff.readUInt32LE(searchLocation + offset);
      offset += intBytes;

      // If the 4-byte number is less than 255, it would have been encoded in a single byte. Skip it
      if (stringBytes < 255) return null;
    }

    // If the string is too short, skip it
    if (stringBytes < shortestString) return null;

    // If the string is too long, skip it
    if (stringBytes > longestString) return null;

    const end = searchLocation + stringBytes + offset;

    // If the string is so long that it would go past the end of the buffer, skip it
    if (end > buff.length) return null;

    // Get the buffer
    const data = Buffer.from(buff.subarray(searchLocation, end));

    // Just the string data
    const stringData = data.subarray(offset);

    // If the string data is not valid UTF-8, skip it
    if (!isUtf8(stringData)) return null;

    const string = stringData.toString('utf-8');

    // If the string contains bad characters, skip it
    if (string.match(badCharacterRegex)) return null;

    return { string, data, end };
  }

  for (let searchLocation = 0; searchLocation < buff.length; searchLocation++) {
    const res = getString(searchLocation);
    if (!res) continue;

    const { string, data, end } = res;

    // Push any unknown data before the string
    pushUnknowns(searchLocation);

    results.push({
      start: searchLocation,
      data,
      string,
    });

    if (end > lastUnknown) {
      lastUnknown = end;
    }

    // Skip over found strings if
    //  - the option is set
    //  - if the next byte is unlikely part of a string
    //  - if there is a valid string after the end of the current string
    if (skipOverFoundString || (buff[end] ?? 0) < 10 || getString(end)) {
      // -1 to account for the increment that will happen
      searchLocation = end - 1;
    }
  }

  pushUnknowns();

  return results;
}
