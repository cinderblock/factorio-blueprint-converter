import { BlueprintEntry } from '../../src/BlueprintData.js';
import BlueprintString from 'factorio-blueprint';

export function checkBlueprintDataMatchesString(data: BlueprintEntry, blueprint: string | null): boolean {
  if (!data && !blueprint) return true;
  if (!data || !blueprint) return false;

  let decoded;
  try {
    decoded = new BlueprintString(blueprint);
  } catch (error) {
    throw new Error(`Error decoding blueprint: ${error instanceof Error ? error.message : error}`);
  }

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
