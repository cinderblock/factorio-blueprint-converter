// TODO: Make this work on Linux and Mac
const factorioDir = process.env.APPDATA + '/Factorio';

export function getBlueprintLocation(v2 = true) {
  return `${factorioDir}/blueprint-storage${v2 ? '-2' : ''}.dat`;
}
