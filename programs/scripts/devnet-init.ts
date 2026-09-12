/**
 * One-time devnet setup (Phase 2B Task 6, Step 4).
 *
 * Creates the devnet test SKR mint (6 decimals, mint authority = the
 * server authority - not the admin - so the backend faucet, Task 8, can
 * mint test SKR without ever holding the admin key), the admin's ATA
 * (used as the protocol treasury), and calls `initConfig` with exactly
 * the `configArgs` values the test suite uses (`tests/fixtures.ts`: ticket
 * price 10 SKR, 3 attempts/ticket, 9500/2000 bps, the revive ladder, a
 * 7200s ebb window, 900s grace, and the payout table).
 *
 * Idempotent: if `Config` already exists, prints the stored public values
 * and exits 0 without sending a transaction.
 *
 * Run from `programs/`:
 *   npx ts-node scripts/devnet-init.ts
 *   (or `npm run devnet:init`)
 *
 * Env:
 *   KEYS_DIR             default /mnt/d/dev/keys - reads admin.json and
 *                        server-authority.json from here (secrets never
 *                        printed).
 *   ANCHOR_PROVIDER_URL  default https://api.devnet.solana.com
 */
import * as fs from "fs";
import * as path from "path";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { SeaInvaders } from "../target/types/sea_invaders";

// Copied verbatim from `tests/fixtures.ts` (`LADDER`/`PAYOUT`) rather than
// imported - importing that file here drags its `createWeekPool` helper
// through this script's strict type-check, which fails on a pre-existing,
// unrelated IDL `relations` typing mismatch (ts-mocha runs the test suite
// with looser settings that don't hit it). Do not let these values diverge
// from `tests/fixtures.ts` if either changes.
const LADDER = [25, 30, 40, 50, 60, 75, 95, 120].map((s) =>
  new BN(s).mul(new BN(1_000_000))
);
const PAYOUT = [3000, 2000, 1200, 800, 600, 480, 480, 480, 480, 480];

const KEYS_DIR = process.env.KEYS_DIR ?? "/mnt/d/dev/keys";
const RPC_URL =
  process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

function loadKeypair(filename: string): Keypair {
  const raw = JSON.parse(
    fs.readFileSync(path.join(KEYS_DIR, filename), "utf8")
  );
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  )[0];
}

function printPublicValues(
  programId: PublicKey,
  skrMint: PublicKey,
  treasury: PublicKey,
  serverAuthority: PublicKey
) {
  console.log(`PROGRAM_ID=${programId.toBase58()}`);
  console.log(`SKR_MINT=${skrMint.toBase58()}`);
  console.log(`TREASURY_ATA=${treasury.toBase58()}`);
  console.log(`SERVER_AUTHORITY=${serverAuthority.toBase58()}`);
}

async function main() {
  const admin = loadKeypair("admin.json");
  const serverAuthority = loadKeypair("server-authority.json");

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(
    connection,
    new Wallet(admin),
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

  const pda = configPda(programId);
  const existing = await program.account.config.fetchNullable(pda);
  if (existing) {
    console.log(
      "Config already initialized on devnet - printing the stored values."
    );
    printPublicValues(
      programId,
      existing.skrMint,
      existing.treasury,
      existing.serverAuthority
    );
    return;
  }

  console.log(
    "Creating the devnet test SKR mint (decimals 6, mint authority = server authority)..."
  );
  const mint = await createMint(
    connection,
    admin,
    serverAuthority.publicKey,
    null,
    6
  );

  console.log("Creating the admin's treasury ATA...");
  const treasuryAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    mint,
    admin.publicKey
  );
  const treasury = treasuryAccount.address;

  console.log("Calling initConfig...");
  const args = {
    serverAuthority: serverAuthority.publicKey,
    treasury,
    ticketPrice: new BN(10_000_000),
    attemptsPerTicket: 3,
    ticketPoolBps: 9500,
    purchasePoolBps: 2000,
    reviveLadder: LADDER,
    ebbSeconds: 7200,
    graceSeconds: 900,
    payoutBps: PAYOUT,
  };
  const sig = await program.methods
    .initConfig(args)
    .accounts({ admin: admin.publicKey, skrMint: mint })
    .signers([admin])
    .rpc();
  console.log(`initConfig tx: ${sig}`);

  console.log("");
  printPublicValues(programId, mint, treasury, serverAuthority.publicKey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
