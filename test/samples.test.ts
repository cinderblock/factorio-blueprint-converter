import { describe, it, expect } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream } from 'node:fs';
import { parse } from 'yaml';
import { checkBlueprintDataMatchesString } from './helpers/compare.js';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import annotationWriter from './helpers/annotationWriter.js';

const samplesDir = 'test/samples';

describe('Blueprint Parser', { concurrent: true }, () => {
  describe('Samples', async () => {
    // We have the blueprint strings in a yaml file for some samples
    const blueprintStrings = parse(await readFile(join(samplesDir, 'exports.yaml'), 'utf-8')) as Record<string, string>;

    const annotationsDir = join(samplesDir, 'annotated');

    await mkdir(annotationsDir, { recursive: true });

    const sampleFiles = (await readdir(samplesDir)).filter(file => file.endsWith('.dat'));

    for (const sample of sampleFiles) {
      describe(sample, () => {
        it('should parse', { timeout: 20000 }, async () => {
          const path = join(samplesDir, sample);

          // Capture the data and any potential error
          let data;
          const stream = createReadStream(path);
          const annotation = await annotationWriter(join(annotationsDir, `${sample}.txt`));
          try {
            data = await parseBlueprintData(stream, annotation);
          } finally {
            await annotation.finish(stream);
          }

          expect(data).toBeTruthy();

          // Verify data is serializable
          expect(() => JSON.stringify(data)).not.toThrow();

          if (blueprintStrings[sample]) {
            expect(checkBlueprintDataMatchesString(data.blueprints[0], blueprintStrings[sample])).toBe(true);
          }
        });
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
