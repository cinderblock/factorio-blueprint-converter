import { readFile, writeFile } from 'node:fs/promises';

async function readTSV(path: string) {
  const file = await readFile(path, 'utf-8');
  const data = file
    .split('\n')
    // Remove whitespace
    .map(line => line.trim())
    // Remove empty lines
    .filter(Boolean)
    .map(line => line.split('\t'));
  const headers = data.shift();
  if (!headers) {
    throw new Error(`No headers found in ${file}`);
  }
  return { headers, data };
}

const MainDataFile = 'test/samples-annotated/parsedProportion.log.tsv';

async function main(newDataFile: string) {
  const { headers, data } = await readTSV(MainDataFile);
  const { headers: incomingHeaders, data: newData } = await readTSV(newDataFile);

  const dateHeader = headers.indexOf('date');
  if (dateHeader === -1) throw new Error(`No date header found in ${MainDataFile}`);

  if (process.platform === 'win32') {
    for (let i = 0; i < incomingHeaders.length; i++) {
      incomingHeaders[i] = incomingHeaders[i].replace('\\', '/');
    }
  }

  // Add newData, that matches existing headers, to the end of data
  for (const line of newData) {
    // Ignore data that doesn't match existing headers
    data.push(headers.map(header => line[incomingHeaders.indexOf(header.replace('/', '\\'))]));
  }

  // Sort data by date
  data.sort((a, b) => new Date(a[dateHeader]).getTime() - new Date(b[dateHeader]).getTime());

  // Add headers to start of data
  data.unshift(headers);

  // Write to file
  return writeFile(MainDataFile, data.map(line => line.join('\t')).join('\n') + '\n');
}

const newDataFile = MainDataFile + '.old';

main(newDataFile).catch(e => {
  console.error(e);
  process.exitCode = 1;
  setTimeout(() => {
    console.log('Forcing exit...');
    process.exit(-1);
  }, 500).unref();
});
