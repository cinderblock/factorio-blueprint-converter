type SplitResult = { start: number; data: Buffer; string?: string };

// All known strings are at least 3 bytes long
const ShortestString = 3;

/**
 * Find Factorio Strings in a buffer and return the original buffer split into chunks with the strings parsed in an easy to process object format.
 *
 * Factorio strings start with a Factorio Number, which describes the length of the string.
 *
 * A Factorio Number is up to a 32-bit unsigned integer but, if it is less than 255, it is encoded in a single byte.
 * If it is greater than or equal to 255, it is encoded in a 5 byte sequence, starting with a 0xFF byte, followed by 4 bytes of the number, LE
 *
 * @param buff
 * @returns
 */
export default function findStrings(buff: Buffer): SplitResult[] {
  const results: SplitResult[] = [];

  let lastUnknown = 0;
  let searchLocation = 0;

  function pushUnknowns(end?: number) {
    const data = buff.subarray(lastUnknown, end);
    if (data.length) results.push({ start: lastUnknown, data });
  }

  while (searchLocation < buff.length - 1) {
    let stringBytes = buff[searchLocation];

    if (!stringBytes) {
      searchLocation++;
      continue;
    }

    if (stringBytes < ShortestString) {
      searchLocation++;
      continue;
    }

    let offset = 1;
    if (stringBytes === 0xff) {
      stringBytes = buff.readUInt32LE(searchLocation + offset);
      if (stringBytes < 255) {
        searchLocation++;
        continue;
      }
      offset += 4;
    }

    if (searchLocation + offset + stringBytes > buff.length) {
      searchLocation++;
      continue;
    }

    const data = buff.subarray(searchLocation, searchLocation + stringBytes + offset);

    const string = data.toString('utf-8', offset);

    // test for non-printable characters
    if (string.match(/[^\s\p{L}\p{M}\p{N}\p{S}\p{P}]/u)) {
      searchLocation++;
      continue;
    }

    pushUnknowns(searchLocation);

    results.push({
      start: searchLocation,
      data,
      string,
    });

    searchLocation += stringBytes + offset;
    lastUnknown = searchLocation;
  }

  pushUnknowns();

  return results;
}
