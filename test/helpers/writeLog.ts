import { createWriteStream, createReadStream } from 'fs';
import { stat, rename, writeFile } from 'fs/promises';
import { join } from 'path/posix';
import readFileUntil from './readFileUntil.js';
import { getGitHash } from './git.js';
import { AnnotationsDir } from './dirs.js';

export const hash = getGitHash().catch(() => 'unknown');

export async function writeLogs(parsedProportion: Record<string, number | string>) {
  parsedProportion['git hash'] = await hash;

  const jobs = [writeJson(parsedProportion), writeLogFile(parsedProportion)];

  await Promise.all(jobs);
}

async function writeLogFile(parsedProportion: Record<string, number | string>) {
  const outPath = join(AnnotationsDir, 'parsedProportion.log.tsv');
  const outPathOld = outPath + '.old';
  const stats = await stat(outPath).catch(() => {});
  const order: string[] = [];
  let copyOld = false;

  if (stats?.size) {
    // load existing header and sort to match
    order.push(...(await readFileUntil(outPath, '\n').then(r => r.split('\t'))));

    const missing = Object.keys(parsedProportion).filter(key => !order.includes(key));
    order.push(...missing);

    if (missing.length) {
      await rename(outPath, outPathOld);
      copyOld = true;
    }
  }

  const writeStream = createWriteStream(outPath, { flags: 'a' });

  async function write(data: string | Buffer) {
    return writeStream.write(data) || new Promise<void>(resolve => writeStream.once('drain', resolve));
  }

  async function writeLine(data: string[]) {
    await write(data.join('\t') + '\n');
  }

  if (copyOld) {
    await writeLine(order);

    const readStream = createReadStream(outPathOld);

    const before = '\n';

    while (true) {
      if (!readStream.readable) await new Promise(resolve => readStream.once('readable', resolve));
      const chunk = readStream.read(600) as Buffer;

      if (chunk) {
        const index = chunk.indexOf(before);
        if (index === -1) continue;

        await write(chunk.subarray(index + before.length));
      }

      break;
    }

    readStream.pipe(writeStream, { end: false });

    await new Promise(resolve => readStream.on('end', resolve));
  }

  if (!stats?.size) {
    order.push(...Object.keys(parsedProportion));
    await writeLine(order);
  }

  await writeLine(order.map(k => parsedProportion[k]).map(v => (typeof v === 'number' ? v.toFixed(3) : v)));
  await new Promise(resolve => writeStream.end(resolve));
}

function writeJson(parsedProportion: Record<string, number | string>) {
  return writeFile(join(AnnotationsDir, 'parsedProportion.json'), JSON.stringify(parsedProportion, null, 2));
}
