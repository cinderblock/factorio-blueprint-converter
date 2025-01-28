import { it, expect, describe } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream } from 'node:fs';

describe('Broken', { concurrent: true, timeout: 200 }, () => {
  it(`should handle errors for corrupted stream`, async () => {
    // Create a corrupted stream by using a json file
    const corruptedStream = createReadStream('package.json');
    await expect(parseBlueprintData(corruptedStream)).rejects.toThrow();
  });

  it('should handle non-existent file', async () => {
    const nonExistentStream = createReadStream('nonexistent.dat');
    nonExistentStream.on('error', () => {});
    await expect(parseBlueprintData(nonExistentStream)).rejects.toThrow();
  });
});
