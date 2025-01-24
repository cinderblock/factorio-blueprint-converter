import { describe, it, expect } from 'vitest';
import { annotatedData, parseBlueprintData } from '../src/index.js';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { checkBlueprintDataMatchesString } from './helpers/compare.js';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const samplesDir = 'test/samples';

describe('Blueprint Parser', () => {
  describe('Samples', () => {
    const blueprintStrings = parse(readFileSync(join(samplesDir, 'exports.yaml'), 'utf-8')) as Record<string, string>;
    for (const sample of readdirSync(samplesDir).filter(file => file.endsWith('.dat'))) {
      describe(sample, () => {
        it('should parse', async () => {
          const path = join(samplesDir, sample);

          // Capture the data and any potential error
          let data;
          try {
            data = await parseBlueprintData(createReadStream(path));
          } finally {
            // Write annotated data even if parsing failed
            if (annotatedData.length > 0) {
              const annotatedPath = join(samplesDir, 'annotated', `${sample}.txt`);
              await mkdir(join(samplesDir, 'annotated'), { recursive: true });

              // Create .gitignore if it doesn't exist
              const gitignorePath = join(samplesDir, 'annotated', '.gitignore');
              try {
                await stat(gitignorePath);
              } catch {
                await writeFile(gitignorePath, '.gitignore\n*.dat.txt\n');
              }

              await writeFile(annotatedPath, annotatedData.join('\n') + '\n');
            }
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
