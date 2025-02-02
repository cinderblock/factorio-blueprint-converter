import { describe, it, expect, afterAll } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream } from 'node:fs';
import { checkBlueprintDataMatchesString } from './helpers/compare.js';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import annotationWriter from './helpers/annotationWriter.js';
import { timeToString } from './helpers/timeToString.js';
import { AnnotationsDir, SamplesDir } from './helpers/dirs.js';
import { writeLogs } from './helpers/writeLog.js';
import { loadSamples } from './helpers/loadSamples.js';

describe('Samples', { concurrent: true, timeout: 1000 }, async () => {
  // We have the blueprint strings in a yaml file for some samples
  const { blueprintStrings, sampleFiles } = await loadSamples();

  const parsedProportion: Record<string, number | string> = {};
  parsedProportion.date = timeToString();

  for (const sample of sampleFiles) {
    const standardizedName = sample.replace('\\', '/').replace(/\.dat$/, '');

    describe(standardizedName, async () => {
      const path = join(SamplesDir, sample);
      const stream = createReadStream(path);

      const outPath = join(AnnotationsDir, `${sample}.txt`);

      await mkdir(dirname(outPath), { recursive: true });

      const annotation = annotationWriter(outPath);

      it('should parse and return an object', { timeout: 500 }, async () => {
        const data = await parseBlueprintData(stream, annotation);

        expect(data).toBeTruthy();

        // Verify data is serializable
        expect(() => JSON.stringify(data)).not.toThrow();

        if (blueprintStrings[sample]) {
          if (blueprintStrings[sample].length !== data.blueprints.length) {
            throw new Error(
              `Blueprint string length ${blueprintStrings[sample].length} does not match data length ${data.blueprints.length}`,
            );
          }
          blueprintStrings[sample].forEach((blueprintString, i) => {
            it(`should match blueprint string ${i}`, () => {
              expect(checkBlueprintDataMatchesString(data.blueprints[i], blueprintString)).toBe(true);
            });
          });
        }
      });

      afterAll(async () => {
        const originalFilesize = (await stat(path)).size;
        parsedProportion[sample] = annotation.getParsedBytes() / originalFilesize;
        await annotation.finish(stream, originalFilesize);
      }, 400);
    });
  }

  afterAll(() => writeLogs(parsedProportion), 700);
});
