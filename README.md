# Factorio Blueprint Converter

Simple tool to convert Factorio game data of user blueprints to, and eventually from, a JSON format that can be used in other applications.
The initial goal is to be able to have a file per blueprint that can be committed and tracked in a version control system.

## Early Development!

This project is in early development and is not yet ready for use.

## Usage

Back up your data.

```bash
npm install
npm run start
```

It automatically finds the default blueprint data file and extracts it.

For now, it just prints some stuff to terminal.
Eventually, it will write the JSON data to a file tree.
