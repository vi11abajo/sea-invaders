// Builds an @anchor-lang/core Program client from the checked-in IDL.
//
// `Program`'s constructor is `new Program(idl, provider?, coder?, getCustomResolver?)`
// (see node_modules/@anchor-lang/core/dist/cjs/program/index.d.ts) - a
// positional `provider`, not an options object. `Provider` (dist/cjs/provider.d.ts)
// is a plain interface (`{ connection, publicKey? }`), so a read-only
// provider that only builds instructions and reads accounts - never signs or
// sends - can be a bare object; no `AnchorProvider`/wallet needed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Program } from '@anchor-lang/core';
import { chainConfig } from './config.js';
import { connection as defaultConnection } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawIdl = JSON.parse(readFileSync(join(__dirname, 'idl', 'sea_invaders.json'), 'utf8'));

/** The Program client, built against `connection` (defaults to `chain/connection.js`). `PROGRAM_ID` overrides the IDL's own `address`. */
export function program(connection = defaultConnection()) {
  const { programId } = chainConfig();
  const idl = { ...rawIdl, address: programId.toBase58() };
  return new Program(idl, { connection });
}
