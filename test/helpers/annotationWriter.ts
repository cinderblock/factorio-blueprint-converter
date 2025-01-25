import { Annotation } from '../../src/index.js';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import PQueue from 'p-queue';

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

  void write(`Load time: ${loadTime.toLocaleString()}\n`);
  void write(`Start time: ${startTime.toLocaleString()}\n`);
  void write(`Time taken: ${startTime.getTime() - loadTime.getTime()}ms\n`);

  let peeking = false;
  let needsNewline = false;

  const labels: string[] = [];

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

      if (needsNewline) {
        void write('\n');
      } else {
        needsNewline = true;
      }

      void write(`${location.toString().padStart(4)} ${buffer.toString('hex').padEnd(80)} ${labels.join(' ')}`);
    },
    decoded: (v: string) => {
      void write(' => ');
      void write(v);
    },
    finish: async (stream: Readable, originalFilesize?: number) => {
      void write('\n');
      void write('\n');

      const remaining = await streamToBuffer(stream);

      if (originalFilesize !== undefined) void write(`Original file size: ${originalFilesize}\n`);
      void write(`Remaining bytes: ${remaining.length}\n`);

      if (remaining.length) void write('\n');

      void write((remaining.toString('hex').match(/.{1,80}/g) ?? []).join('\n'));
      await write('\n');

      const endTime = new Date();
      await write(`End time: ${endTime.toLocaleString()}\n`);
      await write(`Time taken: ${endTime.getTime() - startTime.getTime()}ms\n`);
    },
  };
}
