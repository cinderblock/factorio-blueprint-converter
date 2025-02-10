import { Readable } from 'node:stream';

export function createStream(data: Buffer) {
  const stream = new Readable();
  stream.push(data);
  stream.push(null);
  return stream;
}
