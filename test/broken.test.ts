import { it, expect, describe } from 'vitest';
import { parseBlueprintData } from '../src/index.js';
import { createReadStream } from 'node:fs';
import { createStream } from './helpers/createStream.js';

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

  it('should throw for < v1.0.0', async () => {
    const stream = createStream(Buffer.alloc(100));
    await expect(parseBlueprintData(stream)).rejects.toThrow();
  });

  it('should throw for == v1.0.0', async () => {
    const buff = Buffer.alloc(100);
    buff[0] = 1;
    await expect(parseBlueprintData(createStream(buff))).rejects.toThrow();
  });

  it('should throw for branchVersion non-zero', async () => {
    const buff = Buffer.alloc(100);
    buff[8] = 1;
    await expect(parseBlueprintData(createStream(buff))).rejects.toThrow();
  });
});
