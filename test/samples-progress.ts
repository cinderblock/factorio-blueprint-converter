// Generate progress graphs from samples-annotated/parsedProportion.log.tsv
import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function main() {
  const file = await readFile('test/samples-annotated/parsedProportion.log.tsv', 'utf-8');

  const lines = file
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'));
  const headers = lines.shift();
  if (!headers) {
    throw new Error('No headers found');
  }

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

  const hashes = spliceData('git hash');
  const dates = spliceData('date');
  const complete = spliceData('passed');

  const rows = transpose(data);

  let svg = '';

  const Left = 55;
  const Right = 40;
  const Header = 30;
  const CellHeight = 10;
  const Width = 800;
  const Height = hashes.length * CellHeight + Header;

  const legendX = Left + 20;
  const legendY = Header + 100;
  const legendHeight = 20;
  const legendFont = `font-size="${legendHeight}px" alignment-baseline="top"`;
  const legendChars = 30;

  const majorMarks = [0, 0.5, 1];
  const minorMarks = [0.25, 0.75];

  function rowY(rowIndex: number) {
    return Height - (rowIndex + 0.5) * CellHeight;
  }
  function map(x: number | string, outMin = Left, outMax = Width - Right) {
    if (typeof x === 'string') {
      x = parseFloat(x);
      if (isNaN(x)) {
        throw new Error(`Invalid number: ${x}`);
      }
    }

    return x * (outMax - outMin) + outMin;
  }

  function getColor(index: number) {
    return `hsl(${(index * 360) / (headers?.length ?? 50)}, 100%, 50%)`;
  }

  svg += '<?xml version="1.0" encoding="UTF-8" standalone="no"?>';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${Width}" height="${Height}">`;

  // Dark mode support
  svg += `<style>
    svg { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      .dark-mode-invert { stroke: white; }
      .dark-mode-invert-fill { fill: white; }
    }
  </style>`;

  // Major mark lines
  majorMarks.forEach(x => {
    x = map(x);
    svg += `<line x1="${x}" y1="${Header}" x2="${x}" y2="${Height}" stroke="currentColor" class="dark-mode-invert" stroke-width="3px" stroke-dasharray="8,3" />`;
  });

  // Minor mark lines
  minorMarks.forEach(x => {
    x = map(x);
    svg += `<line x1="${x}" y1="${Header}" x2="${x}" y2="${Height}" stroke="grey" stroke-width="1px" stroke-dasharray="3,3" />`;
  });

  // Hash labels
  svg += `<text x="0" y="${rowY(hashes.length)}" alignment-baseline="middle" fill="grey" font-size="12px" font-family="monospace">newest</text>`;
  hashes.forEach((hash, index) => {
    const dirty = hash.includes('-dirty');
    svg += `<text x="0" y="${rowY(index)}" alignment-baseline="middle" class="${dirty ? '' : 'dark-mode-invert-fill'}" fill="${dirty ? 'grey' : 'currentColor'}" font-size="12px" font-family="monospace"${dirty ? ' font-style="italic"' : ''}>${hash.slice(0, 7)}</text>`;
  });

  // Sample points/chart
  rows.forEach((row, rowIndex, rows) => {
    // Skip the first row. Picket fence error.
    row.forEach((cell, colIndex) => {
      const color = getColor(colIndex);
      const x = map(cell);
      const y = rowY(rowIndex);
      svg += `<circle cx="${x}" cy="${y}" r="2" fill="${color}" />`;
      if (!rowIndex) return;
      svg += `<line x1="${map(rows[rowIndex - 1][colIndex])}" y1="${rowY(rowIndex - 1)}" x2="${x}" y2="${y}" stroke="${color}" stroke-width="2px" />`;
    });
  });

  // Major mark labels
  majorMarks.forEach(x => {
    svg += `<text x="${map(x)}" y="30" class="dark-mode-invert-fill" fill="currentColor" font-size="20px" font-weight="bold" text-anchor="${x === 0 ? 'start' : x === 1 ? 'end' : 'middle'}" alignment-baseline="top">${(x * 100).toFixed(0)}%</text>`;
  });
  svg += `<text x="${map(0.75)}" y="20" class="dark-mode-invert-fill" fill="currentColor" font-size="20px" font-weight="bold" text-anchor="middle" alignment-baseline="top">Sample Parsing Progress</text>`;
  svg += `<text x="${Left}" y="10" class="dark-mode-invert-fill" fill="currentColor" font-size="12px" alignment-baseline="top">Parsed Proportion</text>`;

  // Legend
  svg += `<text x="${legendX}" y="${legendY - legendHeight}" class="dark-mode-invert-fill" fill="currentColor" ${legendFont}>Legend</text>`;
  headers.forEach((header, index) => {
    svg += `<text x="${legendX}" y="${legendY + index * legendHeight}" fill="${getColor(index)}" ${legendFont}>${limitLength(header, legendChars)}</text>`;
  });

  // Number of passing samples
  svg += `<text x="${Width}" y="${rowY(complete.length)}" alignment-baseline="middle" class="dark-mode-invert-fill" fill="currentColor" font-size="12px" text-anchor="end">done</text>`;
  complete.forEach((finished, index) => {
    svg += `<text x="${Width}" y="${rowY(index)}" alignment-baseline="middle" class="dark-mode-invert-fill" fill="currentColor" font-size="12px" text-anchor="end">${Number(finished).toFixed(0)}</text>`;
  });

  svg += '</svg>';

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

function limitLength(str: string, length = 10) {
  return str.length > length ? str.slice(0, length - 3) + '...' : str;
}
