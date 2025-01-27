import { describe, it, expect, afterAll } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream } from 'node:fs';
import { parse } from 'yaml';
import { checkBlueprintDataMatchesString } from './helpers/compare.js';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import annotationWriter from './helpers/annotationWriter.js';
import { BlueprintData } from '../src/BlueprintData.js';

const SamplesDir = 'test/samples';

describe('Samples', { concurrent: true, timeout: 1000 }, async () => {
  // We have the blueprint strings in a yaml file for some samples
  const blueprintStrings = parse(await readFile(join(SamplesDir, 'exports.yaml'), 'utf-8')) as Record<string, string>;

  const annotationsDir = join(SamplesDir, 'annotated');

  await mkdir(annotationsDir, { recursive: true });

  const sampleFiles = (await readdir(SamplesDir)).filter(file => file.endsWith('.dat'));

  for (const sample of sampleFiles) {
    describe(sample, async () => {
      const path = join(SamplesDir, sample);

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
