import { join } from 'node:path';

function getUserDir() {
  if (process.platform === 'win32') {
    return process.env.APPDATA;
  }

  // TODO: Test this on Linux and Mac
  return process.env.HOME;
}

const factorioDir = process.env.FACTORIO_DIR ?? join(getUserDir() ?? '.', 'Factorio');

export function getBlueprintLocation(v2 = true) {
  return `${factorioDir}/blueprint-storage${v2 ? '-2' : ''}.dat`;
}
