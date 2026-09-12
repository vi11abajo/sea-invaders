/**
 * One-time devnet setup (Phase 2B Task 6, Step 5).
 *
 * Creates `WeekPool` for the current week and the next week (payer:
 * admin, here - the backend's crank does the same later with the server
 * authority, Task 9). Idempotent per week: skips any week whose pool
 * already exists.
 *
 * The current week is derived from the RPC clock the same way the
 * program does (spec Sec5.1): `day = floor(blockTime / 86400)`,
 * `week = floor((day + 3) / 7)`.
 *
 * Run from `programs/`:
 *   npx ts-node scripts/create-week-pools.ts
 *   (or `npm run devnet:pools`)
 *
 * Env:
 *   KEYS_DIR             default /mnt/d/dev/keys - reads admin.json.
 *   ANCHOR_PROVIDER_URL  default https://api.devnet.solana.com
 */
import * as fs from "fs";
import * as path from "path";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SeaInvaders } from "../target/types/sea_invaders";

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

function weekPda(programId: PublicKey, week: number): PublicKey {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(week);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("week"), buf],
    programId
  )[0];
}

async function main() {
  const admin = loadKeypair("admin.json");
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

  const config = await program.account.config.fetchNullable(
    configPda(programId)
  );
  if (!config) {
    throw new Error("Config not found - run devnet-init.ts first.");
  }
  const skrMint = config.skrMint as PublicKey;

  const slot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(slot);
  if (blockTime === null) {
    throw new Error("getBlockTime returned null for the current slot.");
  }
  const day = Math.floor(blockTime / 86400);
  const week = Math.floor((day + 3) / 7);
  console.log(`RPC blockTime=${blockTime} day=${day} week=${week}`);

  for (const w of [week, week + 1]) {
    const pda = weekPda(programId, w);
    const existing = await program.account.weekPool.fetchNullable(pda);
    if (existing) {
      console.log(
        `WeekPool(${w}) already exists at ${pda.toBase58()} - skipping.`
      );
      continue;
    }
    console.log(`Creating WeekPool(${w})...`);
    // `skr_mint` carries `relations: ["config"]` in the IDL (the client
    // could read it off the already-resolved `config` PDA instead), which
    // makes strict `.accounts()` reject it as an already-resolved property
    // - `.accountsPartial()` (same as `tests/fixtures.ts`'s `buyTicket`/
    // `settleWeek` helpers) allows passing it explicitly regardless.
    const sig = await program.methods
      .createWeekPool(w)
      .accountsPartial({
        payer: admin.publicKey,
        skrMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();
    console.log(`WeekPool(${w}) created at ${pda.toBase58()} - tx ${sig}`);
  }

  // `getProgramAccounts` (behind `.all()`) can lag a beat behind a
  // just-confirmed transaction on devnet's indexing, so retry briefly
  // rather than reporting a false negative right after creating a pool.
  let ours: Awaited<ReturnType<typeof program.account.weekPool.all>> = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const pools = await program.account.weekPool.all();
    ours = pools.filter(
      (p) => p.account.week === week || p.account.week === week + 1
    );
    if (ours.length === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  console.log(
    `Verified: ${ours.length} week pool(s) found for week ${week} and ${
      week + 1
    }.`
  );
  if (ours.length !== 2) {
    throw new Error(
      `Expected 2 week pools (${week}, ${week + 1}), found ${ours.length}.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
