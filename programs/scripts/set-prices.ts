/**
 * Changes the on-chain prices the players pay: the Daily Run ticket and the Tide's revive ladder,
 * both stored in `Config` (SKR base units, 6 decimals). Every other `Config` field is read from the
 * chain and sent back unchanged, so this only ever moves prices. Shop item prices live in the
 * `Catalog` instead - change them in `init-catalog.ts` and run it with `--update`.
 *
 * Idempotent: when the stored prices already match `TICKET_SKR`/`LADDER_SKR`, it prints them and
 * exits 0 without a transaction.
 *
 * Run from `programs/`:
 *   npx ts-node scripts/set-prices.ts            (or `npm run devnet:prices`)
 *
 * Env:
 *   KEYS_DIR             required - your keys directory; reads admin.json from here (secrets
 *                        never printed).
 *   ANCHOR_PROVIDER_URL  default https://api.devnet.solana.com
 */
import { BN } from "@anchor-lang/core";
import { configPda, loadKeypair, loadProgram } from "./common";

const SKR = 1_000_000;

/** The Daily Run ticket (3 attempts), in SKR. */
const TICKET_SKR = 10;
/** The Tide's revive price by step 0..7, in SKR; must never decrease from one step to the next. */
const LADDER_SKR = [5, 6, 8, 10, 12, 15, 19, 24]; // the original 25..120 ladder divided by 5 (owner, 2026-09-15)

function toBase(skr: number): BN {
  // Prices may carry decimals (e.g. 2.5 SKR); base units stay integers.
  return new BN(Math.round(skr * SKR));
}

function describe(ticket: BN, ladder: BN[]): string {
  const fmt = (v: BN) => (v.toNumber() / SKR).toString();
  return `  ticket ${fmt(ticket)} SKR\n  ladder ${ladder.map(fmt).join(" -> ")} SKR`;
}

async function main() {
  const admin = loadKeypair("admin.json");
  const { program, programId } = loadProgram(admin);
  const pda = configPda(programId);

  const cfg = await program.account.config.fetch(pda);
  const wantTicket = toBase(TICKET_SKR);
  const wantLadder = LADDER_SKR.map(toBase);
  if (wantLadder.length !== cfg.reviveLadder.length) {
    throw new Error(`LADDER_SKR must have ${cfg.reviveLadder.length} steps`);
  }
  const same =
    cfg.ticketPrice.eq(wantTicket) && cfg.reviveLadder.every((v: BN, i: number) => v.eq(wantLadder[i]));
  console.log("Stored prices:");
  console.log(describe(cfg.ticketPrice, cfg.reviveLadder));
  if (same) {
    console.log("Already up to date.");
    return;
  }

  console.log("Calling updateConfig with:");
  console.log(describe(wantTicket, wantLadder));
  const args = {
    serverAuthority: cfg.serverAuthority,
    treasury: cfg.treasury,
    ticketPrice: wantTicket,
    attemptsPerTicket: cfg.attemptsPerTicket,
    ticketPoolBps: cfg.ticketPoolBps,
    purchasePoolBps: cfg.purchasePoolBps,
    reviveLadder: wantLadder,
    ebbSeconds: cfg.ebbSeconds,
    graceSeconds: cfg.graceSeconds,
    payoutBps: cfg.payoutBps,
  };
  const sig = await program.methods
    .updateConfig(args)
    .accounts({ admin: admin.publicKey })
    .rpc({ commitment: "confirmed" });
  console.log(`updateConfig tx: ${sig}`);

  const after = await program.account.config.fetch(pda);
  console.log("Prices now:");
  console.log(describe(after.ticketPrice, after.reviveLadder));
  const ladderOk = after.reviveLadder.every((v: BN, i: number) => v.eq(wantLadder[i]));
  if (!after.ticketPrice.eq(wantTicket) || !ladderOk) throw new Error("prices read back do not match");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
