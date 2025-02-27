import esMain from 'es-main';
import { inflateSync } from 'node:zlib';

// This file deals with Factorio's "Blueprint String" format which is common for all versions of Factorio.

// Decoding: 0eNp1z7FqwzAQBuBXMTfLg02JFW2hyZAlCbG3pgTbuYQD+WwkudQYvXslp0ModBEc+u87/hkaPeJgiB2oGW5oW0ODo55BQVltzlWy3ZXv5/2p2h8PF06TI2NSuj6899Fw3eKFd4ftawoEUNuzBfUxg6UH1zrabhowoOSwCwmuuzjZKKW/EviwyTf8BpX5TwHIjhzhE1qG6cpj16AJgX8IAUNv6VlghiCleSFgAiV9JJfr6qW0AF03qGNb4of+0y18f6Gxi5bL7K1Y54WUcrXOcu9/ADq3Z9s=
// {
//   "blueprint": {
//     "description": "START DESCRIPTION\n- One Stone furnace\nEND DESCRIPTION",
//     "icons": [
//       {
//         "signal": {
//           "type": "item",
//           "name": "stone-furnace"
//         },
//         "index": 1
//       }
//     ],
//     "entities": [
//       {
//         "entity_number": 1,
//         "name": "stone-furnace",
//         "position": {
//           "x": -27,
//           "y": 8
//         }
//       }
//     ],
//     "item": "blueprint",
//     "label": "Single Stone furnace",
//     "version": 281479278886912
//   }
// }

// Decoding: 0eNpNi00LgjAYgP+KvGeDCie5W6kHLxa6W4X48R5Guo1tSSH+94YUdn0+Jmj6JyrNha0aKR9Ap5UYoNe7D9ziAHTFmyX0oa8b7J1IB2Xf3umnva/u0LSaK8ulcFHJjgXzkrSMi+zCsnN+E2me/AO31K3lI1ZcdPgCuvVhRG2Wn4T7KIgiQsjuEITBPH8AP7082w==
// {
//   "blueprint_book": {
//     "blueprints": [],
//     "item": "blueprint-book",
//     "label": "Empty Blueprint book",
//     "description": "START DESCRIPTION\nEND DESCRIPTION",
//     "active_index": 0,
//     "version": 562949955518464
//   }
// }

// Decoding: 0eNptj0EOgjAQRa/SzBoSEVDbpa48gQs1BMqojaUltCIJ6d0tiOnG7X9/3syMUMkXtp1Qtqi0fgIbQ2KAna8RCIsNsBDHczECWVYoPdj/AFlAjYZ3orVCK49jcuRakYSRgxS3G8GhldqIHs1FLSxj5KR1jYrwBxrrFcLH0/oRjLirUk53qbJB7+OTJQ4WcL6uahyAJS76M/Ce1fFXHcqZ87+V3HpHsUSrCHrszHx3vlnTjNI8T3fblKbOfQCmu2UG
// {
//   "blueprint_book": {
//     "blueprints": [],
//     "item": "blueprint-book",
//     "label": "Blueprint book",
//     "description": "- Icon 1: Cliff explosives\n- Icon 4: Wooden chest",
//     "icons": [
//       {
//         "signal": {
//           "name": "cliff-explosives"
//         },
//         "index": 1
//       },
//       {
//         "signal": {
//           "name": "wooden-chest"
//         },
//         "index": 4
//       }
//     ],
//     "active_index": 0,
//     "version": 562949955387393
//   }
// }

// Decoding: 0eNq9VMtKw0AU/ZXLXadQ+7IJKuhaBIXShZYyTW7bgclMnJlaS8kH+Bcu9Mf8Eu+kRCPSjQR3k3MO58w9ZO4eN8XKiozmhRJak8Vkj468l3rlwjkXRUGWj/d7XFqTB8zvCsIESXvpdxihFnn43hqTke6ka3Ke0ceNUIFP0ApLDKQmL4QV3nAIXmAZoTd/sVO0Ip0JG7S5yTaK5krm0mPS/QKcMj5cesYpUmf0zGQZtTvCx8vrvw8xaHuIc/w2H7dtftYwP+m13/9703/Uvv9bw7/XLWcRZuRSKwsvjWbFRCtyDoxfk91KR+AKSuVSUhaBUAqmVRxUce5Bd+BS72DBr4ss+LXQcMex4A1c138DBNWN8b+ZQNSg5kR+oAGaGsu5P8wa7NUhy1hwXAAId9ziuKYqwRP3Wi+LTr0sIlRiQYqZ5qhwe+gVJge5Y90TL5GqtOGoFw/ieDjsj0/7cb8sPwGLcYtp
// {
//   "upgrade_planner": {
//     "settings": {
//       "mappers": [
//         {
//           "from": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "rare",
//             "comparator": ">"
//           },
//           "to": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "legendary",
//             "module_limit": 0,
//             "module_slots": []
//           },
//           "index": 0
//         },
//         {
//           "from": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "rare",
//             "comparator": "≠"
//           },
//           "to": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "legendary",
//             "module_limit": 0,
//             "module_slots": []
//           },
//           "index": 4
//         },
//         {
//           "from": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "rare",
//             "comparator": "="
//           },
//           "index": 8
//         },
//         {
//           "from": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "rare",
//             "comparator": "<"
//           },
//           "index": 12
//         },
//         {
//           "from": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "rare",
//             "comparator": "≥"
//           },
//           "index": 16
//         },
//         {
//           "from": {
//             "type": "entity",
//             "name": "wooden-chest",
//             "quality": "rare",
//             "comparator": "≤"
//           },
//           "index": 20
//         }
//       ],
//       "description": "Unless otherwise specified, all Wooden chests\n- Any better than Rare to Legendary \n- Not Rare to Legendary\n- Rare to nothing\n- Worse than Rare to nothing\n- Better or same as Rare to nothing\n- Worse or same as Rare to nothing"
//     },
//     "item": "upgrade-planner",
//     "label": "Wooden chest Quality Upgrades",
//     "version": 562949955387393
//   }
// }

// Decoding: 0eNqrVkpJTc7PKy4pKk0uyczPiy/ISczLSy1SsqpWKk4tKcnMSy8GsVNSi5OLMgtASpSslIJDHINCFFxcg52DPANCPP39YvJc/VyQBZRqdZQyS1JzgYpRLdCFWaCjlJOYlJoDVOCaW1BSqeCCokwBoawstagYbK2RhaGJuaWRuYWFhZmloVFtLQCwLUB3
// {
//   "deconstruction_planner": {
//     "settings": {
//       "description": "START DESCRIPTION\nEND DESCRIPTION"
//     },
//     "item": "deconstruction-planner",
//     "label": "Empty Deconstruction planner",
//     "version": 281479278886912
//   }
// }

// Decoding: 0eNpVjk8LgkAQR7/KMmc9KJGrt0oPXizUoyC2TrG0rrI7BSF+9zToj7eBee/HG6FF0WtL5i5I9roeVKM1GohGsEgk9dUuN2qS9KwvUhGauutbhMhzZtkKI4fFhAiKcpeXLE6KQ56eyvSYVdple9WIm5KWKp1k8f8XJgckYTeb6wj3E+GAas6oZuC7wuIVyn7oA419d/jc2wShH3DOt6HnT9MLo8tPEg==
// {
//   "deconstruction_planner": {
//     "settings": {
//       "entity_filter_mode": 1,
//       "description": "START DESCRIPTION\n- Blacklist\nEND DESCRIPTION"
//     },
//     "item": "deconstruction-planner",
//     "label": "Blacklist Deconstruction planner",
//     "version": 281479278886912
//   }
// }

type BlueprintEntry = Blueprint | BlueprintBook | DeconstructionPlanner | UpgradePlanner;

type Blueprint = {
  blueprint: {
    description: string;
    icons: {
      signal: {
        type: string;
        name: string;
      };
      index: number;
    }[];
    entities: {
      entity_number: number;
      name: string;
      position: { x: number; y: number };
    }[];
    item: string;
    label: string;
    version: number;
  };
};

type BlueprintBook = {
  blueprint_book: {
    blueprints: BlueprintEntry[];
    item: string;
    label: string;
    description: string;
    active_index: number;
    version: number;
  };
};

type DeconstructionPlanner = {
  deconstruction_planner: {
    description: string;
    icons: {
      signal: {
        type: string;
        name: string;
      };
      index: number;
    }[];
    entity_filter_mode: number;
    entity_filters: {
      index: number;
      name: string;
    }[];
    trees_rocks_only: boolean;
    tile_filter_mode: number;
    tile_selection_mode: number;
    tile_filters: {
      index: number;
      name: string;
    }[];
    version: number;
  };
};

type UpgradePlanner = {
  upgrade_planner: {
    description: string;
    icons: {
      signal: {
        type: string;
        name: string;
      };
      index: number;
    }[];
    mappers: {
      index: number;
      from: {
        type: string;
        name: string;
      };
      to: {
        type: string;
        name: string;
      };
    }[];
    version: number;
  };
};

// A blueprint string is a JSON representation of the blueprint, compressed with zlib deflate using compression level 9 and then encoded using base64 with a version byte in front of the encoded string.
// The version byte is currently 0 (for all Factorio versions through 1.0).
// So to get the JSON representation of a blueprint from a blueprint string, skip the first byte, base64 decode the string, and finally decompress using zlib inflate.

export function decodeBlueprintString(blueprint: string): BlueprintEntry {
  const version = blueprint[0];
  if (version !== '0') throw new Error(`Unsupported version: ${version}`);

  const base64 = blueprint.slice(1);
  const decoded = Buffer.from(base64, 'base64');
  const inflated = inflateSync(decoded);

  const parsed = JSON.parse(inflated.toString()) as BlueprintEntry;

  return parsed;
}

export function printBlueprintString(blueprint: string) {
  console.log(`Decoding: ${blueprint}`);

  const raw = decodeBlueprintString(blueprint);

  const pretty = JSON.stringify(raw, null, 2);

  console.log(pretty);

  //   const decoded = new BlueprintString(blueprint);
  //   console.log(decoded);
  //   console.log(Object.keys(decoded));
}

if (esMain(import.meta)) {
  const strings = process.argv.slice(2);

  for (const string of strings) {
    printBlueprintString(string);
  }
}
