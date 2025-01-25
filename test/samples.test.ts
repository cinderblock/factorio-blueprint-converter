import { describe, it, expect, afterAll } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream } from 'node:fs';
import { parse } from 'yaml';
import { checkBlueprintDataMatchesString } from './helpers/compare.js';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import annotationWriter from './helpers/annotationWriter.js';
import { BlueprintData } from '../src/BlueprintData.js';

const samplesDir = 'test/samples';

describe('Blueprint Parser', { concurrent: true, timeout: 1000 }, () => {
  describe('Samples', async () => {
    // We have the blueprint strings in a yaml file for some samples
    const blueprintStrings = parse(await readFile(join(samplesDir, 'exports.yaml'), 'utf-8')) as Record<string, string>;

    const annotationsDir = join(samplesDir, 'annotated');

    await mkdir(annotationsDir, { recursive: true });

    const sampleFiles = (await readdir(samplesDir)).filter(file => file.endsWith('.dat'));

    for (const sample of sampleFiles) {
      describe(sample, async () => {
        const path = join(samplesDir, sample);

        // Capture the data and any potential error
        let data: BlueprintData;
        const stream = createReadStream(path);
        const annotation = annotationWriter(join(annotationsDir, `${sample}.txt`));
        it('should parse and return an object', { timeout: 500 }, async () => {
          data = await parseBlueprintData(stream, annotation);

          expect(data).toBeTruthy();

          // Verify data is serializable
          expect(() => JSON.stringify(data)).not.toThrow();

          if (blueprintStrings[sample]) {
            it('should match blueprint string', () => {
              expect(checkBlueprintDataMatchesString(data.blueprints[0], blueprintStrings[sample])).toBe(true);
            });
          }
        });

        const originalFilesize = (await stat(path)).size;

        afterAll(() => annotation.finish(stream, originalFilesize), 400);
      });
    }
  });

  return;
  // Broken

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
