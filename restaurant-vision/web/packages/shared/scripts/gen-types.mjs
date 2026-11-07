// Generates src/contracts/types.ts from src/contracts/schema.json (json-schema-to-typescript).
// schema.json is produced by `python -m rv_contracts.schema_export`; never edit either by hand.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../src/contracts/schema.json');
const outPath = resolve(here, '../src/contracts/types.ts');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const version = schema['x-schema-version'] ?? 'unknown';

const ts = await compile(schema, 'RvContracts', {
  bannerComment: [
    '/* eslint-disable */',
    '/**',
    ' * Generated from src/contracts/schema.json by scripts/gen-types.mjs',
    ` * (rv_contracts schema version ${version}). Do not edit by hand: run \`pnpm gen:types\`.`,
    ' */',
  ].join('\n'),
  additionalProperties: false,
  unreachableDefinitions: true,
  strictIndexSignatures: true,
  format: true,
  style: { singleQuote: true, printWidth: 100, trailingComma: 'all' },
});

const extra = `\n/** Contract schema version these types were generated from. */\nexport const CONTRACT_SCHEMA_VERSION = '${version}';\n`;
await writeFile(outPath, ts + extra, 'utf8');
console.log(`wrote ${outPath}`);
