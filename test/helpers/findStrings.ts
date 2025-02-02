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

  for (let searchLocation = 0; searchLocation < buff.length; searchLocation++) {
    let stringBytes = buff[searchLocation];

    let offset = 1;
    if (stringBytes === 0xff) {
      const intBytes = 4;
      if (searchLocation + offset + intBytes > buff.length) continue;

      stringBytes = buff.readUInt32LE(searchLocation + offset);
      offset += intBytes;

      // If the 4-byte number is less than 255, it would have been encoded in a single byte. Skip it
      if (stringBytes < 255) continue;
    }

    // If the string is too short, skip it
    if (stringBytes < shortestString) continue;

    // If the string is too long, skip it
    if (stringBytes > longestString) continue;

    const end = searchLocation + stringBytes + offset;

    // If the string is so long that it would go past the end of the buffer, skip it
    if (end > buff.length) continue;

    // Get the buffer
    const data = Buffer.from(buff.subarray(searchLocation, end));

    // Just the string data
    const stringData = data.subarray(offset);

    // If the string data is not valid UTF-8, skip it
    if (!isUtf8(stringData)) continue;

    const string = stringData.toString('utf-8');

    // If the string contains bad characters, skip it
    if (string.match(badCharacterRegex)) continue;

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

    // Skip over found strings if the option is set or if the next byte is unlikely part of a string
    if (skipOverFoundString || (buff[end] ?? 0) < 10) {
      // -1 to account for the increment that will happen
      searchLocation += stringBytes + offset - 1;
    }
  }

  pushUnknowns();

  return results;
}
