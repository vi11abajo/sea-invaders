/**
 * Shared bootstrap for the devnet scripts (`devnet-init.ts`, `create-week-pools.ts`,
 * `smoke-test.ts`): loading a keypair from `KEYS_DIR`, deriving the `config`/`week` PDAs
 * (must match the Rust seeds and `backend/src/chain/pdas.js` exactly), and building the
 * Anchor provider + program from the built IDL. Behaviour is unchanged from what each script
 * used to duplicate inline.
 *
 * Env:
 *   KEYS_DIR             default /mnt/d/dev/keys - reads keypair files from here (secrets
 *                        never printed).
 *   ANCHOR_PROVIDER_URL  default https://api.devnet.solana.com
 */
import * as fs from "fs";
import * as path from "path";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SeaInvaders } from "../target/types/sea_invaders";

export const KEYS_DIR = process.env.KEYS_DIR ?? "/mnt/d/dev/keys";
export const RPC_URL =
  process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

export function loadKeypair(filename: string): Keypair {
  const raw = JSON.parse(
    fs.readFileSync(path.join(KEYS_DIR, filename), "utf8")
  );
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  )[0];
}

export function weekPda(programId: PublicKey, week: number): PublicKey {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(week);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("week"), buf],
    programId
  )[0];
}

export interface LoadedProgram {
  connection: Connection;
  provider: AnchorProvider;
  program: Program<SeaInvaders>;
  programId: PublicKey;
}

/** Builds the Anchor provider (fee payer: `wallet`) and program from the built IDL at `target/idl/sea_invaders.json`. */
export function loadProgram(wallet: Keypair): LoadedProgram {
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(
    connection,
    new Wallet(wallet),
    AnchorProvider.defaultOptions()
  );

  const idlPath = path.join(
    __dirname,
    "..",
    "target",
    "idl",
    "sea_invaders.json"
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program<SeaInvaders>(idl, provider);

  return { connection, provider, program, programId };
}
