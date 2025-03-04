import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse } from 'yaml';
import { SamplesDir } from './dirs.js';

export async function loadSamples() {
  const files = (await readdir(SamplesDir, { recursive: true })).map(p => p.replace('\\', '/'));
  const sampleFiles = files.filter(file => file.match(/[^/]\.dat$/));
  const exportsFiles = files.filter(file => file.match(/(^|[/])exports.yaml$/));

  const blueprintStrings: Record<string, (string | null)[]> = {};

  for (const exportsFile of exportsFiles) {
    const dir = dirname(exportsFile);
    const exports = parse(await readFile(join(SamplesDir, exportsFile), 'utf-8')) as Record<
      string,
      string | (string | null)[]
    >;
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
