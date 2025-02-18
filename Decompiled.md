# Decompiled Factorio.exe Sources

Below is a high level overview of the flow of the function(s) we care about in Factorio's decompiled sources.

## Important Functions

### [`BlueprintLibrary::loadFromStorage()`](loadFromStorage.cpp)

1. Calls `BlueprintShelf::loadFromStorage(BlueprintShelf *this,basic_string<> *filename)`
2. Calls `BlueprintShelf::loadFromStorageStream(BlueprintShelf *this,ReadStream *stream)`
3. If read stream is valid, calls...

- MapDeserialiser::MapDeserialiser _(constructor)_
  - MapVersion::MapVersion
    - major - 2 bytes
    - minor - 2 bytes
    - patch - 2 bytes
    - developerBuild - 2 bytes
    - branchVersion - 1 byte
- PrototypeMigrationListDefinition::load
  - ...
- PrototypeMigrationList::loadMinimalisticIDMapping
  - ...
- PrototypeMigrationList::loadActiveMigrations
  - ...
- BlueprintShelf::load
  - playerIndex - 2 bytes
  - nextRecordID - 4 bytes
  - 4 or 8 bytes - timestamp
  - 1 byte - boolean - synchronized
  - 4 bytes - array length - `parseLibraryObjects()`
    - 1 byte - used? - if not, skip to next element
    - BlueprintRecord::load
      - 1 byte - Blueprint, BlueprintBook, DeconstructionPlanner, or UpgradePlanner
        - Blueprint
          - ...
        - BlueprintBook
          - ...
        - DeconstructionPlanner
          - ...
        - UpgradePlanner
          - ...
    - if marker is 0, store in `this->dummyBlueprintRecords`, otherwise store in `this->data`, unless `-1`
- MapDeserialiser::loadLoadHelpers(&mapContext)
  - Invoking each “LoadHelper”
    - iterates over (this->loadHelpers), calling LoadHelper::load() on each
      - ...
  - WireConnectorDeserialiser::loadAllWireConnections()
  - if version > 2
    - spaceOptimizedRead() => savedTargetablesCount
    - MapDeserialiser::load<>() => targeterToTargetableMapping (vector of uint32_t)
  - ###### Something wrong here. There is an extra 0 byte!
- Map::setupEntitiesForBlueprintStorage(this->map,&mapContext);
  Probably takes the blueprint data and puts it in the live map.
  We can probably ignore this.

### `BlueprintLibrary::load()`

Used when loading a save game. Not what we're looking for (yet?).

## Reads

### Simple Reads

- MapDeserialiser::load<>(MapDeserialiser \*this) - read 1 byte
- MapDeserialiser::load<short>(MapDeserialiser \*this) - read 2 bytes
- MapDeserialiser::load<int>(MapDeserialiser \*this) - read 4 bytes
- MapDeserialiser::operator>><double>(MapDeserialiser \*this,double \*param_1) - read 8 bytes

### Advanced

- MapDeserialiser::load<>(MapDeserialiser \*this,vector<> \*param_1)
  - Reads a space optimized size
  - Reads a vector of the size of uint32_t data
- MapDeserialiser::load<bool>(MapDeserialiser \*this,bool \*result) - 1 byte, 0 or 1
- MapDeserialiser::load<MapTick>(MapDeserialiser \*this,MapTick \*result)
  - if (mapVersion > 0x1000200000175) - 8 bytes
  - else - 4 bytes
- ID<>::load(ID<> *this,MapDeserialiser *param_1) = readEntry(this->type)
