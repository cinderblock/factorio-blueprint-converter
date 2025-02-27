import { BlueprintEntry } from '../../src/BlueprintData.js';
import { decodeBlueprintString } from '../../src/BlueprintString.js';

export function checkBlueprintDataMatchesString(data: BlueprintEntry, blueprint: string | null): boolean {
  if (!data && !blueprint) return true;
  if (!data || !blueprint) return false;

  const decoded = decodeBlueprintString(blueprint);

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
