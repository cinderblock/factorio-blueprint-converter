import { createReadStream } from 'fs';

export default function readFileUntil(path: string, until: string) {
  const stream = createReadStream(path);
  const buffer: Buffer[] = [];
  return new Promise<string>((resolve, reject) => {
    function onData(chunk: Buffer) {
      buffer.push(chunk);
      if (Buffer.concat(buffer).toString('utf-8').includes(until)) {
        onEnd();
      }
    }
    function onEnd() {
      const str = Buffer.concat(buffer).toString('utf-8');
      const index = str.indexOf(until);
      resolve(str.slice(0, index === -1 ? undefined : index));
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onError);
    }

    function onError(error: Error) {
      reject(error);
    }

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}
