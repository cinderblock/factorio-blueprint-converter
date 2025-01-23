import { BlueprintEntry } from '../../src/BlueprintData.js';
import BlueprintString from 'factorio-blueprint';

export function checkBlueprintDataMatchesString(data: BlueprintEntry, blueprint: string): boolean {
  console.log('Decoding blueprint:', blueprint);
  const decoded = new BlueprintString(blueprint);

  // TODO: finish implementing
  return false;

  for (const blueprint of decoded.blueprints) {
    if (blueprint.key !== data.key) {
      return false;
    }
    // ...
  }
  return true;
}
