import { describe, it, expect, afterAll, afterEach } from 'vitest';
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
import { BlueprintData } from '../src/BlueprintData.js';

describe('Samples', { concurrent: true, timeout: 1000 }, async () => {
  // We have the blueprint strings in a yaml file for some samples
  const { blueprintStrings, sampleFiles } = await loadSamples();

  const parsedProportion: Record<string, number | string> = {};
  parsedProportion.date = timeToString();

  for (const sample of sampleFiles) {
    const standardizedName = sample.replace('\\', '/').replace(/\.dat$/, '');

    describe(standardizedName, { concurrent: false }, async () => {
      const path = join(SamplesDir, sample);
      const stream = createReadStream(path);

      const outPath = join(AnnotationsDir, `${sample}.txt`);

      await mkdir(dirname(outPath), { recursive: true });

      const annotation = annotationWriter(outPath);

      let data: BlueprintData;

      const ShouldParse = 'should parse';
      it(ShouldParse, { timeout: 500 }, async () => {
        data = await parseBlueprintData(stream, annotation);
      });

      it('should be valid', { timeout: 100 }, () => {
        expect(data).toBeTruthy();

        // Verify data is serializable
        expect(() => JSON.stringify(data)).not.toThrow();
      });

      if (blueprintStrings[sample]) {
        it(`should match blueprint strings`, () => {
          expect(blueprintStrings[sample].length).toBe(data.blueprints.length);
          blueprintStrings[sample].forEach((blueprintString, i) => {
            expect(checkBlueprintDataMatchesString(data.blueprints[i], blueprintString)).toBe(true);
          });
        });
      }

      const statPath = stat(path).catch(() => undefined);

      afterEach(async context => {
        if (context.task.name !== ShouldParse) return;
        if (!context.task.result) throw new Error('No result');
        const originalFilesize = (await statPath)?.size;
        if (originalFilesize === undefined) throw new Error('No original filesize');
        parsedProportion[sample] = originalFilesize === 0 ? 1 : annotation.getParsedBytes() / originalFilesize;

        await annotation.finish(stream, originalFilesize, context.task.result);
      }, 400);
    });
  }

  afterAll(() => writeLogs(parsedProportion), 700);
});
