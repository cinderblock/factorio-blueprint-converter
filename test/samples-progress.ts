// Generate progress graphs from samples-annotated/parsedProportion.log.tsv
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import chartist from 'chartist-svg';

async function main() {
  const file = await readFile('test/samples-annotated/parsedProportion.log.tsv', 'utf-8');

  const lines = file
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'));
  const headers = lines.shift();

  const data = transpose(lines);

  function spliceData(header: string) {
    if (!headers) {
      throw new Error('No headers found');
    }
    const index = headers.indexOf(header);
    if (index === -1) {
      throw new Error(`${header} index not found`);
    }
    const removed = data.splice(index, 1)[0];
    headers.splice(index, 1);
    return removed;
  }

  const labels = spliceData('git hash').map(l => l?.slice(0, 6));
  const dates = spliceData('date');
  const complete = spliceData('passed');

  // const series = data.map((row, index) => ({ name: headers[index], value: row.map(Number) }));
  const series = data.map(row => row.map(Number).map(n => n * 100));

  const svg = await chartist(
    'line',
    { labels, series, title: 'Percent complete' },
    {
      chart: {
        width: 800,
        height: 200,
        chartPadding: { left: 0, right: 0 },
      },
      title: {
        x: 0,
        y: 0,
        height: 48,
        'font-size': '18px',
        'font-family': 'Verdana',
        'font-weight': 'bold',
        fill: 'crimson',
        'text-anchor': 'middle', //(... other svg attributes)
      },
      //   subtitle: {
      //     x: 0,
      //     y: 0,
      //     height: 24,
      //     'font-size': '12px',
      //     'font-family': 'Verdana',
      //     'font-weight': 'bold',
      //     fill: 'indianred',
      //     'text-anchor': 'middle', //(... other svg attrbiutes)
      //   },
      css: '',
    },
  );

  await mkdir('html', { recursive: true });

  return writeFile('html/progress.svg', svg);
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
  setTimeout(() => {
    console.log('Forcing exit...');
    process.exit(-1);
  }, 500).unref();
});

function transpose<T>(matrix: T[][]): T[][] {
  return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}
