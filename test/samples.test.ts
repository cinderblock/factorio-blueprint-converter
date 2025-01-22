import { parseBlueprintData } from '../src/index.js';
import { createReadStream, readdirSync } from 'node:fs';

const samplesDir = 'test/samples';

console.log(`Reading samples from ${samplesDir}`);

// get array of sample file names in the samples folder
const samples = readdirSync(samplesDir).filter(file => file.endsWith('.dat'));

describe('Blueprint Sample Parser', () => {
  samples.forEach(sample => {
    describe(`${sample}`, () => {
      it(`should parse ${sample}`, async () => {
        const data = await parseBlueprintData(createReadStream(`${samplesDir}/${sample}`));
        expect(data).toBeTruthy();

        // Verify data is serializable
        expect(() => JSON.stringify(data)).not.toThrow();

        // TODO: check if it matches the blueprint strings in exports.yaml
      });
    });
  });

  it(`should handle errors for corrupted stream`, async () => {
    // Create a corrupted stream by ending it early
    const corruptedStream = createReadStream(`${samplesDir}/${samples[0]}`, { end: 10 });
    await expect(parseBlueprintData(corruptedStream)).rejects.toThrow();
  });

  it('should handle non-existent file', async () => {
    const nonExistentStream = createReadStream(`${samplesDir}/nonexistent.dat`);
    await expect(parseBlueprintData(nonExistentStream)).rejects.toThrow();
  });
});
