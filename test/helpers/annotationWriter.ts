import { Annotation } from '../../src/index.js';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import PQueue from 'p-queue';

function timeToString(time: Date): string {
  return time
    .toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    })
    .replace(/^(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2');
}

const loadTime = new Date();

function streamToBuffer(stream: Readable): Promise<Buffer> {
  if (stream.readableEnded) return Promise.resolve(Buffer.alloc(0));

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export default function annotationWriter(
  filename: string,
): Annotation & { finish: (stream: Readable, originalFilesize?: number) => Promise<void> } {
  const output = createWriteStream(filename, { flags: 'w' });

  const writeQueue = new PQueue({ concurrency: 1 });

  async function doOneWrite(data: string) {
    if (output.write(data)) return;

    await new Promise(resolve => output.once('drain', resolve));
  }
  function write(data: string): Promise<void> {
    return writeQueue.add(() => doOneWrite(data));
  }

  const startTime = new Date();

  void write(`Load time: ${timeToString(loadTime)}\n`);
  void write(`Start time: ${timeToString(startTime)}\n`);
  void write(`Time taken: ${startTime.getTime() - loadTime.getTime()}ms\n`);

  const chunks: Buffer[] = [];

  let peeking = false;
  let needsNewline = false;

  const labels: string[] = [];

  let nextLocation = 0;

  return {
    peek: () => {
      peeking = true;
    },
    pushLabel: (label: string) => {
      labels.push(label);
    },
    popLabel: () => {
      labels.pop();
    },
    read: (buffer: Buffer, location: number) => {
      if (peeking) {
        peeking = false;
        return;
      }

      chunks.push(buffer);

      if (needsNewline) {
        void write('\n');
      } else {
        needsNewline = true;
      }

      if (location !== nextLocation) {
        void write(`Lost data at ${location.toString().padStart(4)}\n`);
      }

      void write(`${location.toString().padStart(4)} ${buffer.toString('hex').padEnd(80)} ${labels.join(' ')}`);
      nextLocation = location + buffer.length;
    },
    decoded: (v: string) => {
      void write(' => ');
      void write(v);
    },
    finish: async (stream: Readable, originalFilesize?: number) => {
      void write('\n');

      const remaining = await streamToBuffer(stream);

      if (remaining.length) {
        chunks.push(remaining);
        const location = originalFilesize !== undefined ? originalFilesize - remaining.length : nextLocation;
        void write(
          (remaining.toString('hex').match(/.{1,80}/g) ?? [])
            .map((l, i) => `${(location + i * 40).toString().padStart(4)} ${l}`)
            .join('\n'),
        );
        void write('\n\n');
      }

      void write(`Unparsed bytes: ${remaining.length}\n\n`);

      if (nextLocation === undefined) {
        void write(`No data read??\n`);
      } else {
        if (originalFilesize !== undefined) {
          void write(`Original file size: ${originalFilesize}\n`);

          const missing = originalFilesize - nextLocation - remaining.length;
          if (missing) {
            void write(`Missing bytes: ${missing}\n`);
          }
        }
      }

      await write('\n\n');

      const endTime = new Date();
      await write(`End time: ${timeToString(endTime)}\n`);
      await write(`Time taken: ${endTime.getTime() - startTime.getTime()}ms\n`);
    },
  };
}
