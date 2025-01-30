import { describe, it, expect, afterAll } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream, createWriteStream } from 'node:fs';
import { parse } from 'yaml';
import { checkBlueprintDataMatchesString } from './helpers/compare.js';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import annotationWriter from './helpers/annotationWriter.js';

const SamplesDir = join(import.meta.dirname, 'samples');

// TODO: Allow env override?
const annotationsDir = join(import.meta.dirname, 'samples-annotated');

describe('Samples', { concurrent: true, timeout: 1000 }, async () => {
  // We have the blueprint strings in a yaml file for some samples
  const { blueprintStrings, sampleFiles } = await loadSamples();

  const parsedProportion: Record<string, number> = {};

  for (const sample of sampleFiles) {
    describe(sample, async () => {
      const path = join(SamplesDir, sample);
      const stream = createReadStream(path);
      const outPath = join(annotationsDir, `${sample}.txt`);

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
          for (let i = 0; i < blueprintStrings[sample].length; i++) {
            it(`should match blueprint string ${i}`, () => {
              expect(checkBlueprintDataMatchesString(data.blueprints[i], blueprintStrings[sample][i])).toBe(true);
            });
          }
        }
      });

      afterAll(async () => {
        const originalFilesize = (await stat(path)).size;
        parsedProportion[sample] = annotation.getParsedBytes() / originalFilesize;
        await annotation.finish(stream, originalFilesize);
      }, 400);
    });
  }

  afterAll(async () => {
    await Promise.all([
      (async () => {
        if (process.env.CI) return;
        const outPath = join(annotationsDir, 'parsedProportion.log.tsv');
        const stats = await stat(outPath).catch(() => null);
        const stream = createWriteStream(outPath, { flags: 'a' });
        function write(data: string) {
          if (stream.write(data)) return;
          return new Promise(resolve => stream.once('drain', resolve));
        }

        // if file empty, write header
        if (!stats?.size) {
          await write(Object.keys(parsedProportion).join('\t') + '\n');
        }

        await write(
          Object.values(parsedProportion)
            .map(v => v.toFixed(3))
            .join('\t') + '\n',
        );
      })(),
      writeFile(join(annotationsDir, 'parsedProportion.json'), JSON.stringify(parsedProportion, null, 2)),
    ]);
  }, 700);
});

async function loadSamples() {
  const files = await readdir(SamplesDir, { recursive: true });
  const sampleFiles = files.filter(file => file.match(/[^/\\]\.dat$/));
  const exportsFiles = files.filter(file => file.match(/(^|[/\\])exports.yaml$/));

  const blueprintStrings: Record<string, string[]> = {};

  for (const exportsFile of exportsFiles) {
    const dir = dirname(exportsFile);
    const exports = parse(await readFile(join(SamplesDir, exportsFile), 'utf-8')) as Record<string, string | string[]>;
    for (let [key, value] of Object.entries(exports)) {
      key = join(dir, key);
      if (blueprintStrings[key]) {
        throw new Error(`Duplicate blueprint string ${key} in ${exportsFile}`);
      }
      if (typeof value === 'string') {
        value = value.split('\n');
      }
      if (!Array.isArray(value)) {
        throw new Error(`Invalid blueprint string ${key} in ${exportsFile}`);
      }

      blueprintStrings[key] = value;
    }
  }

  return { blueprintStrings, sampleFiles, exportsFiles };
}
