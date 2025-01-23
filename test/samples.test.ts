import { describe, it, expect } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { checkBlueprintDataMatchesString } from './helpers/compare.js';

const samplesDir = 'test/samples';

// get array of sample file names in the samples folder

describe('Blueprint Sample Parser', () => {
  const blueprintStrings = parse(readFileSync(`${samplesDir}/exports.yaml`, 'utf-8')) as Record<string, string>;

  readdirSync(samplesDir)
    // Filter out non-dat files
    .filter(file => file.endsWith('.dat'))
    // Only test one sample for now, starting at 8
    // .slice(8)
    // .slice(0, 1)
    .forEach(sample => {
      describe(sample, () => {
        it('should parse', async () => {
          const path = `${samplesDir}/${sample}`;
          const data = await parseBlueprintData(createReadStream(path));

          expect(data).toBeTruthy();

          // Verify data is serializable
          expect(() => JSON.stringify(data)).not.toThrow();

          if (blueprintStrings[sample]) {
            expect(checkBlueprintDataMatchesString(data.blueprints[0], blueprintStrings[sample])).toBe(true);
          }
        });
      });
    });

  return;

  it(`should handle errors for corrupted stream`, async () => {
    // Create a corrupted stream by using a json file
    const corruptedStream = createReadStream(`package.json`);
    await expect(parseBlueprintData(corruptedStream)).rejects.toThrow();
  });

  it('should handle non-existent file', async () => {
    const nonExistentStream = createReadStream(`${samplesDir}/nonexistent.dat`);
    await expect(parseBlueprintData(nonExistentStream)).rejects.toThrow();
  });
});
