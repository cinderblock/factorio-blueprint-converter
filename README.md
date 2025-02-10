# Factorio Blueprint Converter

Simple tool to convert Factorio game data of user blueprints to, and eventually from, a JSON format that can be used in other applications.
The initial goal is to be able to have a file per blueprint that can be committed and tracked in a version control system.

## Early Development!

This project is in early development and is not yet ready for use.

[![Tests](https://github.com/cinderblock/factorio-blueprint-converter/actions/workflows/test.yml/badge.svg)](https://github.com/cinderblock/factorio-blueprint-converter/actions/workflows/test.yml)

[![Development Stats](https://cinderblock.github.io/factorio-blueprint-converter/action-stats/build-stats/dashboard.svg)](https://cinderblock.github.io/factorio-blueprint-converter/action-stats/build-stats)

## Usage

Back up your data.

### Setup

Install npm dependencies

```bash
npm install
```

### Run the tests

```bash
npm run test
```

#### Get a nice UI for the tests

```bash
npm run test:ui
```

#### Watch mode for Tests

```bash
npm run test:watch
```

### Normal usage

```bash
npm start
```

It automatically finds the default blueprint data file and extracts it.

For now, it just prints some stuff to terminal.
Eventually, it will write the JSON data to a file tree where changes can be tracked in a version control system.

#### Dev

Automatically reruns main program on file changes.

```bash
npm run dev
```

## Development

Test scripts currently generate annotated files in the `test/samples/annotated` directory.
These should be helpful for developing the parser and decoding the binary data.

## See Also

### Factorio Wiki

- [Technical Category](https://wiki.factorio.com/Category:Technical) - All low level technical information from Wube
- [Property tree](https://wiki.factorio.com/Property_tree) - A recursive variant format that holds a key-value pair
- [Achievement file format](https://wiki.factorio.com/Achievement_file_format) - Factorio achievement file format
- [Factorio Blueprint String](https://wiki.factorio.com/Blueprint_string_format) - Factorio blueprint string format

### Credits

This decoder is heavily based on the work done by asheiduk in their [Factorio Blueprint Decoder](https://github.com/asheiduk/factorio-blueprint-decoder) project.
